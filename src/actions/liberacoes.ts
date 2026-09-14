"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { withFinancials, type SaleWithFinancials } from "@/lib/sale-financials";
import { getValidAccessTokenForAccount, fetchMoneyReleaseInfo } from "@/lib/mercadolivre";

export type LiberacaoRow = SaleWithFinancials & { netAmount: number };

// Considera "pendente de liberação" toda venda do Mercado Livre cujo status
// de liberação ainda não é "released" (inclui nunca verificadas, onde o
// status fica null).
function notReleasedCondition() {
  return and(
    eq(sales.source, "mercadolivre"),
    or(isNull(sales.moneyReleaseStatus), ne(sales.moneyReleaseStatus, "released"))
  );
}

/**
 * Valor líquido estimado que efetivamente cai na conta do vendedor: receita
 * menos a tarifa de venda do Mercado Livre menos o frete cobrado do
 * vendedor — os três já são valores REAIS (não estimativas) vindos do
 * Mercado Livre no momento da confirmação da venda. Não inclui o custo do
 * produto (isso não é descontado pelo marketplace, é custo interno).
 */
function withNetAmount(sale: ReturnType<typeof withFinancials>): LiberacaoRow {
  return { ...sale, netAmount: sale.revenue - sale.saleFeeAmount - sale.shippingTotal };
}

async function loadPendingReleaseSales(): Promise<LiberacaoRow[]> {
  const rows = await db.select().from(sales).where(notReleasedCondition()).orderBy(sales.saleDate);
  return rows.map((row) => withNetAmount(withFinancials(row)));
}

/**
 * Lista cada venda do Mercado Livre ainda não liberada, para a aba
 * /liberacoes — uma por linha, com todo o detalhe (não é uma agregação).
 */
export async function listLiberacoes(): Promise<LiberacaoRow[]> {
  return loadPendingReleaseSales();
}

/**
 * Resumo para o card do dashboard: quantas vendas e quanto, no total, ainda
 * está pendente de cair na conta.
 */
export async function getPendingReleaseSummary(): Promise<{ count: number; total: number }> {
  const rows = await loadPendingReleaseSales();
  const total = rows.reduce((sum, r) => sum + r.netAmount, 0);
  return { count: rows.length, total };
}

/**
 * Consulta no Mercado Livre a data/status de liberação de todas as vendas
 * ainda não marcadas como liberadas, e atualiza o banco. Agrupa por conta
 * vendedora (mlSellerId) porque o access_token e o lote da consulta são por
 * conta. Vendas antigas sem mlSellerId identificado (confirmadas antes dessa
 * coluna existir) são ignoradas — não tem como saber de qual conta usar o
 * token.
 */
export async function atualizarLiberacoes(): Promise<{ ok: boolean; message: string }> {
  const rows = await db.select().from(sales).where(notReleasedCondition());

  const withOrderAndSeller = rows.filter(
    (row): row is typeof row & { mlOrderId: string; mlSellerId: string } =>
      Boolean(row.mlOrderId) && Boolean(row.mlSellerId)
  );
  const skippedNoSeller = rows.length - withOrderAndSeller.length;

  if (withOrderAndSeller.length === 0) {
    return {
      ok: true,
      message:
        skippedNoSeller > 0
          ? `Nenhuma venda pôde ser verificada: ${skippedNoSeller} venda(s) pendente(s) não tem a conta identificada (foram confirmadas antes desse recurso existir).`
          : "Nenhuma venda pendente de liberação para atualizar.",
    };
  }

  const bySeller = new Map<string, typeof withOrderAndSeller>();
  for (const row of withOrderAndSeller) {
    const list = bySeller.get(row.mlSellerId) ?? [];
    list.push(row);
    bySeller.set(row.mlSellerId, list);
  }

  let updated = 0;
  let released = 0;
  const errors: string[] = [];

  for (const [sellerId, sellerRows] of bySeller) {
    try {
      const accessToken = await getValidAccessTokenForAccount(sellerId);
      const orderIds = Array.from(new Set(sellerRows.map((r) => r.mlOrderId)));
      const info = await fetchMoneyReleaseInfo(orderIds, accessToken);

      for (const row of sellerRows) {
        const releaseInfo = info.get(row.mlOrderId);
        if (!releaseInfo) continue;
        await db
          .update(sales)
          .set({
            moneyReleaseDate: releaseInfo.moneyReleaseDate,
            moneyReleaseStatus: releaseInfo.moneyReleaseStatus,
            moneyReleaseCheckedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sales.id, row.id));
        updated += 1;
        if (releaseInfo.moneyReleaseStatus === "released") released += 1;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "erro desconhecido");
    }
  }

  revalidatePath("/liberacoes");
  revalidatePath("/");

  const skippedNote = skippedNoSeller > 0 ? ` (${skippedNoSeller} sem conta identificada, ignorada(s))` : "";
  if (errors.length > 0) {
    return {
      ok: updated > 0,
      message: `${updated} venda(s) verificada(s), ${released} já liberada(s)${skippedNote}. Erros: ${errors.join("; ")}`,
    };
  }
  return {
    ok: true,
    message: `${updated} venda(s) verificada(s), ${released} já liberada(s)${skippedNote}.`,
  };
}
