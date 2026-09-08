import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mercadolivreCredentials, pendingSales } from "@/db/schema";

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
      id: "default",
      mlUserId: String(token.user_id),
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? "",
      expiresAt,
      scope: token.scope,
    })
    .onConflictDoUpdate({
      target: mercadolivreCredentials.id,
      set: {
        mlUserId: String(token.user_id),
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

export interface MlConnectionStatus {
  connected: boolean;
  mlUserId?: string;
  expiresAt?: Date;
}

export async function getConnectionStatus(): Promise<MlConnectionStatus> {
  const rows = await db
    .select()
    .from(mercadolivreCredentials)
    .where(eq(mercadolivreCredentials.id, "default"))
    .limit(1);
  const row = rows[0];
  if (!row) return { connected: false };
  return { connected: true, mlUserId: row.mlUserId, expiresAt: row.expiresAt };
}

// Margem de segurança antes do vencimento real do access_token, para nunca
// tentar usar um token que expira nos próximos segundos da requisição.
const EXPIRY_BUFFER_MS = 2 * 60 * 1000;

/**
 * Retorna um access_token válido para chamar a API do Mercado Livre,
 * renovando automaticamente via refresh_token quando necessário. Lança um
 * erro claro se a conta ainda não foi conectada.
 */
export async function getValidAccessToken(): Promise<string> {
  const rows = await db
    .select()
    .from(mercadolivreCredentials)
    .where(eq(mercadolivreCredentials.id, "default"))
    .limit(1);
  const row = rows[0];

  if (!row) {
    throw new Error(
      "Conta do Mercado Livre ainda não conectada. Conecte em /pendentes."
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
    .where(eq(mercadolivreCredentials.id, "default"))
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

export async function fetchOrder(orderId: string | number): Promise<MlOrder> {
  const accessToken = await getValidAccessToken();
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
 */
export async function searchRecentOrders(sellerId: string, limit = 20): Promise<MlOrder[]> {
  const accessToken = await getValidAccessToken();
  const url = new URL(`${ML_API_BASE}/orders/search`);
  url.searchParams.set("seller", sellerId);
  url.searchParams.set("sort", "date_desc");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao buscar pedidos recentes (${response.status}): ${text}`);
  }
  const body = (await response.json()) as { results: MlOrder[] };
  return body.results;
}

/**
 * Guarda/atualiza uma linha de "venda pendente" por item do pedido. Usamos
 * onConflictDoUpdate só nos campos de exibição — nunca sobrescrevemos
 * status/matchedProductId/dispatchedBy/resultingSaleId, para não perder uma
 * confirmação já feita caso o Mercado Livre reenvie a mesma notificação (ou
 * a sincronização manual rode de novo sobre o mesmo pedido). Compartilhada
 * entre o webhook e a sincronização manual (/orders/search).
 *
 * `ctx` permite ao chamador (a sincronização manual, que processa vários
 * pedidos em sequência) reaproveitar o access_token e o ID do vendedor em
 * vez de buscá-los de novo a cada pedido. Quando omitido, buscamos aqui
 * mesmo (caso do webhook, que processa um pedido por vez).
 */
export async function upsertPendingSalesFromOrder(
  order: MlOrder,
  ctx?: { accessToken?: string; sellerId?: string }
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
      const accessToken = ctx?.accessToken ?? (await getValidAccessToken());
      const sellerId = ctx?.sellerId ?? (await getConnectionStatus()).mlUserId;
      const cost = await fetchSellerShippingCost(order.shipping.id, accessToken, sellerId);
      shippingCost = cost !== null ? cost.toString() : null;
      buyerFullName = await fetchReceiverName(order.shipping.id, accessToken);
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
  }
}
