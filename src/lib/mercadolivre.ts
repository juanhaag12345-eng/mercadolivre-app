import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { adTitleMappings, mercadolivreCredentials, pendingSales, stockItems } from "@/db/schema";
import { createSaleFromPendingSale } from "@/lib/pending-sale-confirmation";
import { fromReferenceCostPrice } from "@/lib/product-pricing";
import { toNumber } from "@/lib/calculations";
import { toSaoPauloDateISO } from "@/lib/dates";

const ML_API_BASE = "https://api.mercadolibre.com";
const ML_AUTH_BASE = "https://auth.mercadolivre.com.br";

// A partir daqui o dashboard passou a ser alimentado só com dados reais do
// Mercado Livre (título do anúncio, receita, tarifas e frete) em vez do
// cadastro manual de produtos — pedido do usuário em 08/09/2026. Pedidos
// anteriores a essa data continuam existindo no Mercado Livre, mas não
// devem ser trazidos para /pendentes nessa reformulação. Aplicado aqui
// dentro de upsertPendingSalesFromOrder (e não só na sincronização manual)
// para que o webhook do Mercado Livre — que reenvia notificações de
// qualquer pedido, inclusive antigos que mudaram de status — também
// respeite o corte, e não reintroduza vendas antigas em /pendentes.
export const SYNC_MIN_DATE = new Date("2026-09-01T00:00:00-03:00");

// URL de callback cadastrada no aplicativo do Mercado Livre — precisa bater
// exatamente com o que está configurado em "Minhas aplicações", senão a
// troca do código de autorização por token falha.
export const ML_REDIRECT_URI =
  process.env.MERCADOLIVRE_REDIRECT_URI ??
  "https://web2-production-22bd.up.railway.app/api/mercadolivre/callback";

// Origem pública do site, usada para montar redirects absolutos com
// segurança. Não usamos o host da requisição recebida (request.url) porque,
// atrás do proxy do Railway, ele pode chegar como "localhost:8080" em vez do
// domínio público — o que faria o navegador do usuário tentar abrir
// localhost depois do login do Mercado Livre.
export const SITE_ORIGIN = new URL(ML_REDIRECT_URI).origin;

function getClientCredentials() {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "MERCADOLIVRE_CLIENT_ID / MERCADOLIVRE_CLIENT_SECRET não configurados."
    );
  }
  return { clientId, clientSecret };
}

/**
 * Monta a URL de autorização (tela de login/consentimento do Mercado Livre)
 * para a qual o usuário precisa ser redirecionado para conectar a conta.
 */
export function buildAuthorizationUrl(state: string): string {
  const { clientId } = getClientCredentials();
  const url = new URL(`${ML_AUTH_BASE}/authorization`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", ML_REDIRECT_URI);
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token?: string;
}

async function storeTokenResponse(token: TokenResponse) {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  await db
    .insert(mercadolivreCredentials)
    .values({
      mlUserId: String(token.user_id),
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? "",
      expiresAt,
      scope: token.scope,
    })
    .onConflictDoUpdate({
      // mlUserId é único: reconectar a mesma conta (reautorizar) atualiza a
      // linha já existente em vez de criar uma segunda — cada conta nova
      // (mlUserId diferente) vira uma linha própria, o que é o que permite
      // conectar mais de uma conta vendedora ao mesmo tempo.
      target: mercadolivreCredentials.mlUserId,
      set: {
        accessToken: token.access_token,
        // O refresh_token é rotativo — o Mercado Livre nem sempre devolve um
        // novo (ex: fluxos futuros podem omitir), então só sobrescrevemos
        // quando um novo valor realmente veio na resposta.
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
        expiresAt,
        scope: token.scope,
        updatedAt: new Date(),
      },
    });
}

/**
 * Troca o código de autorização (recebido no callback OAuth) pelos tokens de
 * acesso, e já salva no banco.
 */
export async function exchangeAuthorizationCode(code: string): Promise<void> {
  const { clientId, clientSecret } = getClientCredentials();

  const response = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: ML_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao trocar código por token (${response.status}): ${text}`);
  }

  const token = (await response.json()) as TokenResponse;
  await storeTokenResponse(token);
}

async function refreshAccessToken(refreshToken: string): Promise<void> {
  const { clientId, clientSecret } = getClientCredentials();

  const response = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao renovar token (${response.status}): ${text}`);
  }

  const token = (await response.json()) as TokenResponse;
  await storeTokenResponse(token);
}

export interface MlConnection {
  id: string;
  mlUserId: string;
  nickname: string | null;
  expiresAt: Date;
}

/**
 * Lista todas as contas do Mercado Livre conectadas (uma por vendedor
 * autorizado). Substitui a antiga getConnectionStatus() de conta única —
 * agora pode haver zero, uma ou várias contas conectadas ao mesmo tempo.
 */
export async function listConnections(): Promise<MlConnection[]> {
  const rows = await db
    .select()
    .from(mercadolivreCredentials)
    .orderBy(mercadolivreCredentials.createdAt);
  return rows.map((row) => ({
    id: row.id,
    mlUserId: row.mlUserId,
    nickname: row.nickname,
    expiresAt: row.expiresAt,
  }));
}

/**
 * Remove uma conta conectada (desconecta). As vendas já importadas para
 * /pendentes ou já confirmadas permanecem intactas — só a credencial é
 * apagada, então essa conta para de sincronizar/receber webhooks até ser
 * conectada de novo.
 */
export async function removeConnection(id: string): Promise<void> {
  await db.delete(mercadolivreCredentials).where(eq(mercadolivreCredentials.id, id));
}

// Margem de segurança antes do vencimento real do access_token, para nunca
// tentar usar um token que expira nos próximos segundos da requisição.
const EXPIRY_BUFFER_MS = 2 * 60 * 1000;

/**
 * Retorna um access_token válido para a conta do vendedor `mlUserId`,
 * renovando automaticamente via refresh_token quando necessário. Lança um
 * erro claro se essa conta não estiver conectada.
 */
export async function getValidAccessTokenForAccount(mlUserId: string): Promise<string> {
  const rows = await db
    .select()
    .from(mercadolivreCredentials)
    .where(eq(mercadolivreCredentials.mlUserId, mlUserId))
    .limit(1);
  const row = rows[0];

  if (!row) {
    throw new Error(
      `Conta do Mercado Livre ${mlUserId} não está conectada. Conecte em /pendentes.`
    );
  }

  const expiresAtMs = row.expiresAt.getTime();
  if (expiresAtMs - EXPIRY_BUFFER_MS > Date.now()) {
    return row.accessToken;
  }

  await refreshAccessToken(row.refreshToken);

  const refreshed = await db
    .select()
    .from(mercadolivreCredentials)
    .where(eq(mercadolivreCredentials.mlUserId, mlUserId))
    .limit(1);
  if (!refreshed[0]) {
    throw new Error("Falha ao renovar token do Mercado Livre.");
  }
  return refreshed[0].accessToken;
}

// --- Tipos mínimos da resposta de /orders/$ID que a gente de fato usa ---

export interface MlOrderItem {
  item: {
    id: string;
    title: string;
  };
  quantity: number;
  unit_price: number;
  // Comissão do Mercado Livre para esse item — IMPORTANTE: é o valor POR
  // UNIDADE, não o total da linha. Confirmado comparando um pedido de 5
  // unidades (sale_fee: 34.99) com a "Tarifa de venda total" que a própria
  // Central de Vendedores do Mercado Livre mostra pra essa venda (R$174,95
  // = 34.99 × 5). Por isso sempre multiplicamos por `quantity` antes de
  // gravar/exibir (ver upsertPendingSalesFromOrder).
  sale_fee?: number;
}

export interface MlOrder {
  id: number;
  date_created: string;
  status: string;
  order_items: MlOrderItem[];
  // ID do "pack" ao qual o pedido pertence. A Central de Vendedores do
  // Mercado Livre identifica a venda por esse número (não pelo order_id) —
  // até pedidos de um único item costumam vir com pack_id preenchido.
  // Guardamos só pra exibição, pra bater com o link que o vendedor abre no
  // site do Mercado Livre.
  pack_id?: number | null;
  buyer?: {
    nickname?: string;
  };
  // Pagamento(s) do Mercado Pago associados ao pedido — usamos só o id do
  // primeiro (payments[0].id) pra depois consultar a liberação do dinheiro
  // em GET /v1/payments/$id (ver upsertPendingSalesFromOrder e
  // fetchPaymentReleaseInfo). Pedidos com mais de um pagamento (raro) não
  // são tratados especialmente — só o primeiro é guardado.
  payments?: Array<{ id: number }>;
  // A Order só traz o ID do envio (não existe mais "shipping.cost" nessa
  // resposta, mesmo em pedidos antigos que pareciam ter esse campo). Para
  // saber quanto o Mercado Livre efetivamente cobra do vendedor pelo frete
  // — inclusive quando o comprador recebeu frete grátis — é preciso uma
  // chamada separada a /shipments/$id/costs (ver fetchSellerShippingCost).
  shipping?: {
    id?: number;
  };
}

interface MlShipmentCosts {
  senders?: Array<{ user_id: number; cost: number }>;
}

interface MlShipmentDestination {
  destination?: {
    receiver_name?: string;
  };
}

/**
 * Busca, para um envio específico, o valor que o Mercado Livre realmente
 * cobra do vendedor (campo "senders[].cost" do recurso /shipments/$id/costs).
 * Isso é diferente do que o comprador paga: em pedidos com frete grátis o
 * comprador paga 0, mas o vendedor pode ser cobrado do mesmo jeito — é
 * justamente esse valor que queremos mostrar.
 */
async function fetchSellerShippingCost(
  shipmentId: number,
  accessToken: string,
  sellerId?: string
): Promise<number | null> {
  const response = await fetch(`${ML_API_BASE}/shipments/${shipmentId}/costs`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-format-new": "true",
    },
  });
  if (!response.ok) {
    // Alguns envios ainda não têm custo calculado (ex.: acabaram de ser
    // criados) — nesse caso simplesmente não mostramos o valor, sem quebrar
    // o resto da sincronização.
    return null;
  }
  const data = (await response.json()) as MlShipmentCosts;
  const senders = data.senders ?? [];
  if (senders.length === 0) return null;
  const match = sellerId
    ? senders.find((sender) => String(sender.user_id) === sellerId)
    : undefined;
  const cost = (match ?? senders[0]).cost;
  return cost ?? null;
}

/**
 * Busca o nome real de quem recebe a encomenda (dono do endereço de
 * destino do envio). A API de /orders só devolve o id do comprador —
 * nickname e nome completo não são expostos ali por privacidade — mas o
 * endereço de destino do envio traz o nome de quem vai receber, que na
 * prática é o comprador na esmagadora maioria das compras pessoais.
 * Confirmado contra um pedido real: GET /shipments/$id?views=destination
 * com o header X-Api-Version: 2 devolve destination.receiver_name
 * preenchido com o nome completo.
 */
async function fetchReceiverName(
  shipmentId: number,
  accessToken: string
): Promise<string | null> {
  const response = await fetch(`${ML_API_BASE}/shipments/${shipmentId}?views=destination`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-format-new": "true",
      "X-Api-Version": "2",
    },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as MlShipmentDestination;
  return data.destination?.receiver_name ?? null;
}

export async function fetchOrder(orderId: string | number, accessToken: string): Promise<MlOrder> {
  const response = await fetch(`${ML_API_BASE}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao buscar pedido ${orderId} (${response.status}): ${text}`);
  }
  return (await response.json()) as MlOrder;
}

/**
 * Busca os pedidos mais recentes do vendedor direto na API do Mercado Livre
 * (endpoint /orders/search), em vez de esperar o webhook. Serve como rede de
 * segurança manual: se por algum motivo o Mercado Livre não chegar a enviar
 * a notificação de uma venda (ex.: atraso de propagação logo após autorizar
 * o app), essa busca ainda encontra o pedido.
 *
 * Pagina automaticamente (mais recente primeiro) até encontrar um pedido
 * anterior a `sinceDate` — em vez de trazer só uma página fixa de pedidos,
 * o que antes fazia dias mais antigos (ex.: início de setembro) ficarem de
 * fora sempre que o volume de vendas dos dias mais recentes já preenchia
 * sozinho o limite de uma única página. `maxResults` é só uma trava de
 * segurança contra um loop indevido, não um limite normal de uso.
 */
export async function searchRecentOrders(
  sellerId: string,
  opts?: { sinceDate?: Date; maxResults?: number }
): Promise<MlOrder[]> {
  const sinceDate = opts?.sinceDate;
  const maxResults = opts?.maxResults ?? 500;
  const pageSize = 50;

  const orders: MlOrder[] = [];
  let offset = 0;

  while (orders.length < maxResults) {
    const accessToken = await getValidAccessTokenForAccount(sellerId);
    const url = new URL(`${ML_API_BASE}/orders/search`);
    url.searchParams.set("seller", sellerId);
    url.searchParams.set("sort", "date_desc");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Falha ao buscar pedidos recentes (${response.status}): ${text}`);
    }
    const body = (await response.json()) as { results: MlOrder[] };
    if (body.results.length === 0) break;

    orders.push(...body.results);

    // Como a busca vem ordenada da mais nova pra mais antiga, assim que o
    // último pedido da página já é mais antigo que o corte, não precisa
    // buscar mais páginas — todo o resto seria ainda mais antigo.
    const oldestInPage = body.results[body.results.length - 1];
    if (sinceDate && new Date(oldestInPage.date_created) < sinceDate) break;

    if (body.results.length < pageSize) break; // última página
    offset += body.results.length;
  }

  return sinceDate ? orders.filter((order) => new Date(order.date_created) >= sinceDate) : orders;
}

/**
 * Guarda/atualiza uma linha de "venda pendente" por item do pedido. Usamos
 * onConflictDoUpdate só nos campos de exibição — nunca sobrescrevemos
 * status/matchedProductId/dispatchedBy/resultingSaleId, para não perder uma
 * confirmação já feita caso o Mercado Livre reenvie a mesma notificação (ou
 * a sincronização manual rode de novo sobre o mesmo pedido). Compartilhada
 * entre o webhook e a sincronização manual (/orders/search).
 *
 * `ctx` é obrigatório: com mais de uma conta conectada não existe mais um
 * único token/vendedor "padrão" para usar como fallback implícito — todo
 * chamador (webhook, sincronização manual) precisa resolver antes qual
 * conta esse pedido pertence e passar o access_token e o ID do vendedor
 * dessa conta especificamente.
 */
/**
 * Confirma sozinha uma venda pendente recém chegada (webhook ou
 * sincronização manual) QUANDO — e só quando — o título do anúncio já tem
 * um vínculo memorizado em ad_title_mappings, criado antes por uma pessoa
 * confirmando manualmente uma venda daquele mesmo anúncio em /pendentes.
 * Nunca tenta adivinhar por semelhança de texto: sem vínculo exato, a venda
 * simplesmente fica pendente pra revisão manual, como sempre foi — essa é a
 * escolha deliberada (ver AdTitleMappingsPanel) pra nunca aplicar custo nem
 * dar baixa de estoque no produto errado sozinha.
 *
 * `dispatchedBy` entra com um valor provisório (ver
 * sales.dispatchedByConfirmed em schema.ts) porque não tem como saber quem
 * vai despachar o pacote sem alguém decidir — fica sinalizado como
 * pendente de revisão na lista de "confirmadas automaticamente" em
 * /pendentes (ver listAutoConfirmedSales/setDispatchedByForAutoConfirmedSale
 * em actions/mercadolivre.ts).
 */
async function tryAutoConfirmPendingSale(mlOrderId: string, mlOrderItemId: string): Promise<void> {
  const [pending] = await db
    .select()
    .from(pendingSales)
    .where(and(eq(pendingSales.mlOrderId, mlOrderId), eq(pendingSales.mlOrderItemId, mlOrderItemId)))
    .limit(1);
  if (!pending || pending.status !== "pendente") return;

  const [mapping] = await db
    .select({ stockItemId: adTitleMappings.stockItemId })
    .from(adTitleMappings)
    .where(eq(adTitleMappings.adTitle, pending.titleSnapshot))
    .limit(1);
  if (!mapping) return;

  const [item] = await db.select().from(stockItems).where(eq(stockItems.id, mapping.stockItemId)).limit(1);
  // Sem item (não deveria acontecer — a FK do vínculo é onDelete: "cascade")
  // ou sem custo de referência cadastrado ainda: não arrisca lançar com um
  // custo inventado (ex: 0, inflando o lucro), deixa pendente pra alguém
  // revisar e preencher o custo uma vez — depois disso, as próximas do
  // mesmo anúncio voltam a confirmar sozinhas.
  if (!item || item.referenceCostPrice === null) return;

  const unitCost = fromReferenceCostPrice(item.saleUnitType, item.unitsPerPackage, toNumber(item.referenceCostPrice));

  await createSaleFromPendingSale({
    pending,
    stockItemId: item.id,
    quantity: pending.quantity,
    saleDate: toSaoPauloDateISO(pending.orderDate),
    dispatchedBy: "juan",
    productCostManual: unitCost * pending.quantity,
    autoConfirmed: true,
    dispatchedByConfirmed: false,
  });

  revalidatePath("/pendentes");
  revalidatePath("/vendas");
  revalidatePath("/");
  revalidatePath("/produtos");
  revalidatePath("/custo-fornecimento");
  revalidatePath("/compras");
  revalidatePath("/cadastro-produtos");
}

export async function upsertPendingSalesFromOrder(
  order: MlOrder,
  ctx: { accessToken: string; sellerId: string }
) {
  if (new Date(order.date_created) < SYNC_MIN_DATE) {
    // Pedido anterior ao corte de 01/09/2026 — ignorado mesmo se vier via
    // webhook (ex.: reenvio do Mercado Livre por causa de uma mudança de
    // status num pedido antigo).
    return;
  }

  let shippingCost: string | null = null;
  let buyerFullName: string | null = null;
  if (order.shipping?.id) {
    try {
      const cost = await fetchSellerShippingCost(order.shipping.id, ctx.accessToken, ctx.sellerId);
      shippingCost = cost !== null ? cost.toString() : null;
      buyerFullName = await fetchReceiverName(order.shipping.id, ctx.accessToken);
    } catch {
      // Se a consulta de custo de envio/nome do destinatário falhar (ex.:
      // token expirado no meio do processo), seguimos sem esse dado — não é
      // motivo para deixar a venda inteira de fora dos pendentes.
      shippingCost = null;
    }
  }

  const packId = order.pack_id != null ? String(order.pack_id) : null;

  for (const orderItem of order.order_items) {
    // sale_fee vem por UNIDADE — multiplicamos pela quantidade pra bater com
    // a "Tarifa de venda total" que a Central de Vendedores do Mercado Livre
    // mostra pra essa venda (ver comentário em MlOrderItem.sale_fee).
    const saleFee =
      orderItem.sale_fee !== undefined
        ? (orderItem.sale_fee * orderItem.quantity).toFixed(2)
        : null;

    await db
      .insert(pendingSales)
      .values({
        mlOrderId: String(order.id),
        mlOrderItemId: orderItem.item.id,
        mlSellerId: ctx.sellerId,
        mlPackId: packId,
        titleSnapshot: orderItem.item.title,
        quantity: orderItem.quantity,
        unitPriceSnapshot: orderItem.unit_price.toString(),
        mlSaleFeeSnapshot: saleFee,
        mlShippingCostSnapshot: shippingCost,
        orderDate: new Date(order.date_created),
        orderStatusMl: order.status,
        buyerNickname: order.buyer?.nickname ?? null,
        buyerFullName,
        rawOrderPayload: order,
      })
      .onConflictDoUpdate({
        target: [pendingSales.mlOrderId, pendingSales.mlOrderItemId],
        set: {
          mlSellerId: ctx.sellerId,
          mlPackId: packId,
          titleSnapshot: orderItem.item.title,
          quantity: orderItem.quantity,
          unitPriceSnapshot: orderItem.unit_price.toString(),
          mlSaleFeeSnapshot: saleFee,
          mlShippingCostSnapshot: shippingCost,
          orderDate: new Date(order.date_created),
          orderStatusMl: order.status,
          buyerNickname: order.buyer?.nickname ?? null,
          buyerFullName,
          rawOrderPayload: order,
          updatedAt: new Date(),
        },
      });

    // Tenta confirmar sozinha, se esse título de anúncio já tiver vínculo
    // memorizado — ver comentário completo em tryAutoConfirmPendingSale.
    // Roda sempre (webhook e sincronização manual), pra pegar tanto vendas
    // que acabaram de chegar quanto uma pendente antiga cujo anúncio só
    // ganhou vínculo depois (ex: confirmando manualmente uma outra venda do
    // mesmo anúncio). Uma falha aqui não deve derrubar o recebimento da
    // venda em si — ela só continua pendente pra revisão manual.
    try {
      await tryAutoConfirmPendingSale(String(order.id), orderItem.item.id);
    } catch (err) {
      console.error("Falha ao tentar confirmar automaticamente venda pendente:", err);
    }
  }
}

// --- Liberação do dinheiro na conta (ver /liberacoes) ---

export interface MoneyReleaseInfo {
  moneyReleaseDate: Date | null;
  moneyReleaseStatus: string | null;
}

interface MlPaymentResource {
  id: number;
  money_release_date?: string | null;
  money_release_status?: string | null;
}

// Tentamos primeiro /billing/integration/group/ML/order/details (endpoint do
// próprio Mercado Livre, por order_id, em lote) — mas confirmado em teste
// real que esse endpoint devolve 403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES
// pra esse aplicativo (precisa de uma permissão que não temos). O que
// FUNCIONA, confirmado também em teste real com o access_token do vendedor,
// é o recurso de pagamento do Mercado Pago (GET /v1/payments/$id, o mesmo
// domínio da API de Pagamentos) — ele tem os campos money_release_date e
// money_release_status direto na raiz da resposta, sem precisar de nenhuma
// credencial separada do Mercado Pago. A limitação é que só existe por
// pagamento (não em lote por vários IDs de uma vez), por isso
// fetchPaymentReleaseInfo faz uma chamada por pagamento, em pequenos lotes
// paralelos.
const PAYMENT_LOOKUP_CONCURRENCY = 8;

async function fetchSinglePaymentRelease(
  paymentId: string,
  accessToken: string
): Promise<MoneyReleaseInfo | null> {
  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`[liberacoes] falha ao consultar pagamento ${paymentId} (${response.status}): ${text}`);
      return null;
    }
    const body = (await response.json()) as MlPaymentResource;
    return {
      moneyReleaseDate: body.money_release_date ? new Date(body.money_release_date) : null,
      moneyReleaseStatus: body.money_release_status ?? null,
    };
  } catch (err) {
    console.error(`[liberacoes] erro de rede ao consultar pagamento ${paymentId}:`, err);
    return null;
  }
}

/**
 * Consulta, para uma lista de IDs de pagamento (não de pedido — ver
 * `sales.mlPaymentId`) de UM MESMO vendedor, a data e o status de liberação
 * do dinheiro. Processa em pequenos lotes paralelos (não existe consulta em
 * lote nesse endpoint). Pagamentos que falharem na consulta simplesmente
 * ficam de fora do Map retornado — quem chamar decide o que fazer.
 */
export async function fetchPaymentReleaseInfo(
  paymentIds: string[],
  accessToken: string
): Promise<Map<string, MoneyReleaseInfo>> {
  const result = new Map<string, MoneyReleaseInfo>();

  for (let i = 0; i < paymentIds.length; i += PAYMENT_LOOKUP_CONCURRENCY) {
    const batch = paymentIds.slice(i, i + PAYMENT_LOOKUP_CONCURRENCY);
    const infos = await Promise.all(batch.map((id) => fetchSinglePaymentRelease(id, accessToken)));
    batch.forEach((id, idx) => {
      const info = infos[idx];
      if (info) result.set(id, info);
    });
  }

  return result;
}
