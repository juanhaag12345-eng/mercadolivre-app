"use server";

import { revalidatePath } from "next/cache";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import { adTitleMappings, pendingSales, sales, stockItems, type Dispatcher } from "@/db/schema";
import { confirmPendingSaleSchema } from "@/lib/validations";
import { normalizeName, NOVO_PRODUTO_SENTINEL } from "@/lib/stock-matching";
import { createSaleFromPendingSale } from "@/lib/pending-sale-confirmation";
import { withFinancials } from "@/lib/sale-financials";
import {
  listConnections,
  getValidAccessTokenForAccount,
  removeConnection,
  searchRecentOrders,
  updateConnectionNickname,
  upsertPendingSalesFromOrder,
  SYNC_MIN_DATE,
} from "@/lib/mercadolivre";
import type { ActionResult } from "@/actions/products";

export { listConnections };

/**
 * Busca manualmente os pedidos mais recentes de UMA conta específica direto
 * na API do Mercado Livre e atualiza /pendentes — rede de segurança para o
 * caso do webhook não ter recebido (ou ainda não receber) a notificação de
 * uma venda nova. Idempotente: rodar de novo sobre os mesmos pedidos não
 * duplica nem desfaz confirmações já feitas. Ignora pedidos anteriores a
 * SYNC_MIN_DATE. `accountId` é o id da linha em mercadolivre_credentials
 * (cada conta conectada tem seu próprio botão "Buscar vendas recentes").
 */
export async function syncRecentOrders(accountId: string): Promise<{ ok: boolean; message: string }> {
  const connections = await listConnections();
  const connection = connections.find((c) => c.id === accountId);
  if (!connection) {
    return { ok: false, message: "Essa conta do Mercado Livre não está mais conectada." };
  }

  try {
    // Pagina automaticamente pedidos do mais novo pro mais antigo até passar
    // do corte de SYNC_MIN_DATE — antes essa busca trazia só uma página fixa
    // de 20 pedidos, e em dias de mais movimento isso já cobria só os 1-2
    // dias mais recentes, deixando pedidos mais antigos (ainda dentro do
    // período válido) de fora dos pendentes.
    const orders = await searchRecentOrders(connection.mlUserId, { sinceDate: SYNC_MIN_DATE });
    // Busca o access_token uma única vez aqui e reaproveita em todos os
    // pedidos do lote, em vez de cada upsertPendingSalesFromOrder buscar o
    // seu (evita N idas ao banco só pra ler a mesma credencial).
    const accessToken = await getValidAccessTokenForAccount(connection.mlUserId);
    let itemCount = 0;
    for (const order of orders) {
      await upsertPendingSalesFromOrder(order, { accessToken, sellerId: connection.mlUserId });
      itemCount += order.order_items.length;
    }

    revalidatePath("/pendentes");

    if (orders.length === 0) {
      return {
        ok: true,
        message: "Nenhum pedido a partir de 01/09/2026 encontrado na conta do Mercado Livre.",
      };
    }
    return {
      ok: true,
      message: `${orders.length} pedido(s) verificado(s) (${itemCount} item(ns)). A lista abaixo já foi atualizada.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro ao sincronizar com o Mercado Livre.",
    };
  }
}

/**
 * Desconecta uma conta do Mercado Livre (botão de excluir, em /pendentes).
 * As vendas já importadas/confirmadas continuam intactas — só a credencial
 * dessa conta é removida.
 */
export async function removeMlAccount(accountId: string): Promise<void> {
  await removeConnection(accountId);
  revalidatePath("/pendentes");
}

/**
 * Renomeia uma conta conectada (apelido usado em todo filtro por conta —
 * dashboard, vendas, pendentes, liberações, anúncios). Botão de editar ao
 * lado do nome da conta em /pendentes.
 */
export async function updateMlAccountNickname(accountId: string, nickname: string): Promise<void> {
  await updateConnectionNickname(accountId, nickname);
  revalidatePath("/pendentes");
  revalidatePath("/");
  revalidatePath("/vendas");
  revalidatePath("/liberacoes");
  revalidatePath("/produtos");
}

export async function listPendingSales(mlSellerId?: string) {
  const condition = mlSellerId
    ? and(eq(pendingSales.status, "pendente"), eq(pendingSales.mlSellerId, mlSellerId))
    : eq(pendingSales.status, "pendente");
  const rows = await db.select().from(pendingSales).where(condition).orderBy(pendingSales.orderDate);
  return rows;
}

function parseConfirmForm(formData: FormData) {
  return {
    quantity: Number(formData.get("quantity") ?? 1),
    saleDate: String(formData.get("saleDate") ?? ""),
    dispatchedBy: String(formData.get("dispatchedBy") ?? ""),
    productCostManual: String(formData.get("productCostManual") ?? "0"),
    stockItemId: String(formData.get("stockItemId") ?? ""),
    newStockItemName: String(formData.get("newStockItemName") ?? ""),
  };
}

/**
 * Confirma uma venda pendente: cria a venda de verdade usando os valores
 * REAIS que já vieram do Mercado Livre (título do anúncio, receita, tarifa
 * de venda total, frete cobrado do vendedor) — não existe mais um produto
 * cadastrado a escolher. A única informação que a pessoa precisa preencher
 * é o custo do produto dessa venda e quem despachou.
 */
export async function confirmPendingSale(
  pendingSaleId: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const raw = parseConfirmForm(formData);
  const parsed = confirmPendingSaleSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[issue.path.join(".") || "form"] = issue.message;
    }
    return { ok: false, errors };
  }

  const [pending] = await db
    .select()
    .from(pendingSales)
    .where(and(eq(pendingSales.id, pendingSaleId), eq(pendingSales.status, "pendente")))
    .limit(1);

  if (!pending) {
    return { ok: false, errors: { form: "Essa venda pendente não existe mais ou já foi processada." } };
  }

  const values = parsed.data;

  // Quando o item vendido ainda não existe no estoque, a pessoa pode
  // cadastrá-lo na hora em vez de precisar sair pra aba Produtos primeiro —
  // mesmo espírito do "criar produto novo" da aprovação de NF-e. Reconfere
  // por nome (já normalizado) antes de criar, pra não duplicar se o mesmo
  // produto novo já tiver sido cadastrado confirmando outra venda pendente
  // dele um instante antes.
  let resolvedStockItemId = values.stockItemId;
  if (resolvedStockItemId === NOVO_PRODUTO_SENTINEL) {
    const newName = (values.newStockItemName ?? "").trim();
    if (!newName) {
      return { ok: false, errors: { newStockItemName: "Informe o nome do novo produto" } };
    }
    const normalized = normalizeName(newName);
    const existingItems = await db.select({ id: stockItems.id, name: stockItems.name }).from(stockItems);
    const existingMatch = existingItems.find((i) => normalizeName(i.name) === normalized);
    if (existingMatch) {
      resolvedStockItemId = existingMatch.id;
    } else {
      // internalCode não é mais `serial` (ver schema.ts) — calculamos o
      // próximo número (MAX + 1) na hora de criar.
      const [{ maxCode }] = await db
        .select({ maxCode: sql<number>`coalesce(max(${stockItems.internalCode}), 0)` })
        .from(stockItems);
      const [created] = await db
        .insert(stockItems)
        .values({ internalCode: maxCode + 1, name: newName, minStock: 0 })
        .returning({ id: stockItems.id });
      resolvedStockItemId = created.id;
    }
  }

  await createSaleFromPendingSale({
    pending,
    stockItemId: resolvedStockItemId,
    quantity: values.quantity,
    saleDate: values.saleDate,
    dispatchedBy: values.dispatchedBy as Dispatcher,
    productCostManual: values.productCostManual,
    autoConfirmed: false,
    dispatchedByConfirmed: true,
  });

  // Memoriza (ou corrige, se a pessoa escolheu um produto diferente dessa
  // vez) o vínculo "esse título de anúncio → esse produto de estoque" — é
  // isso que permite confirmar sozinhas as próximas vendas do MESMO anúncio
  // (ver tryAutoConfirmPendingSale, em lib/mercadolivre.ts). Nunca cria
  // vínculo por adivinhação, só quando uma pessoa confirma manualmente.
  await db
    .insert(adTitleMappings)
    .values({ adTitle: pending.titleSnapshot, stockItemId: resolvedStockItemId, unitsPerSale: values.unitsPerSale })
    .onConflictDoUpdate({
      target: adTitleMappings.adTitle,
      set: { stockItemId: resolvedStockItemId, unitsPerSale: values.unitsPerSale, updatedAt: new Date() },
    });

  revalidatePath("/pendentes");
  revalidatePath("/vendas");
  revalidatePath("/");
  revalidatePath("/produtos");
  revalidatePath("/custo-fornecimento");
  revalidatePath("/compras");
  revalidatePath("/cadastro-produtos");
  return { ok: true };
}

export async function ignorePendingSale(pendingSaleId: string) {
  await db
    .update(pendingSales)
    .set({ status: "ignorada", updatedAt: new Date() })
    .where(eq(pendingSales.id, pendingSaleId));
  revalidatePath("/pendentes");
}

// ---- Confirmação automática por anúncio já mapeado ----

export type AutoConfirmedSaleRow = ReturnType<typeof withFinancials> & {
  stockItemName: string | null;
  stockItemInternalCode: number | null;
};

/**
 * Últimas vendas confirmadas sozinhas pelo sistema (sem passar por revisão
 * manual em Pendentes) — pra conferência em /pendentes. Não filtra por
 * `dispatchedByConfirmed`: mostra tanto as que ainda precisam que alguém
 * escolha quem despachou quanto as já corrigidas, pra servir de histórico.
 */
export async function listAutoConfirmedSales(limit = 30): Promise<AutoConfirmedSaleRow[]> {
  const rows = await db
    .select({ sale: sales, stockItemName: stockItems.name, stockItemInternalCode: stockItems.internalCode })
    .from(sales)
    .leftJoin(stockItems, eq(sales.stockItemId, stockItems.id))
    .where(eq(sales.autoConfirmed, true))
    .orderBy(desc(sales.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    ...withFinancials(row.sale),
    stockItemName: row.stockItemName,
    stockItemInternalCode: row.stockItemInternalCode,
  }));
}

/**
 * Preenche quem despachou de verdade uma venda que entrou sozinha (ver
 * autoConfirmed/dispatchedByConfirmed em schema.ts) — até isso ser chamado,
 * dispatchedBy tem um valor provisório que já vale pro rateio operacional de
 * 5%, então essa correção é o que garante que o Juan/Djow certo recebe.
 */
export async function setDispatchedByForAutoConfirmedSale(saleId: string, dispatchedBy: Dispatcher) {
  await db
    .update(sales)
    .set({ dispatchedBy, dispatchedByConfirmed: true, updatedAt: new Date() })
    .where(eq(sales.id, saleId));
  revalidatePath("/pendentes");
  revalidatePath("/vendas");
  revalidatePath("/");
}

// ---- Gerenciar vínculos "anúncio → produto" memorizados ----

export interface AdTitleMappingRow {
  id: string;
  adTitle: string;
  stockItemId: string;
  stockItemName: string;
  stockItemInternalCode: number;
  unitsPerSale: number;
  updatedAt: Date;
}

/** Todos os vínculos memorizados, mais recentemente atualizados primeiro — pra revisar/corrigir em /pendentes. */
export async function listAdTitleMappings(): Promise<AdTitleMappingRow[]> {
  return db
    .select({
      id: adTitleMappings.id,
      adTitle: adTitleMappings.adTitle,
      stockItemId: adTitleMappings.stockItemId,
      stockItemName: stockItems.name,
      stockItemInternalCode: stockItems.internalCode,
      unitsPerSale: adTitleMappings.unitsPerSale,
      updatedAt: adTitleMappings.updatedAt,
    })
    .from(adTitleMappings)
    .innerJoin(stockItems, eq(adTitleMappings.stockItemId, stockItems.id))
    .orderBy(desc(adTitleMappings.updatedAt));
}

/**
 * Corrige manualmente pra qual produto um anúncio aponta e/ou quantas
 * unidades físicas ele representa por unidade vendida (ver
 * ad_title_mappings.unitsPerSale) — não mexe em vendas já confirmadas com o
 * vínculo antigo, só nas próximas.
 */
export async function updateAdTitleMapping(id: string, stockItemId: string, unitsPerSale: number) {
  await db
    .update(adTitleMappings)
    .set({ stockItemId, unitsPerSale, updatedAt: new Date() })
    .where(eq(adTitleMappings.id, id));
  revalidatePath("/pendentes");
}

/** Remove o vínculo — a próxima venda desse anúncio volta a cair em Pendentes pra escolha manual. */
export async function deleteAdTitleMapping(id: string) {
  await db.delete(adTitleMappings).where(eq(adTitleMappings.id, id));
  revalidatePath("/pendentes");
}
