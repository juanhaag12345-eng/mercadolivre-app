import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import {
  getValidAccessTokenForAccount,
  fetchPaymentReleaseInfo,
  fetchShippingStatusInfo,
  SHIPPING_STATUS_TERMINAL,
} from "@/lib/mercadolivre";

// Considera "pendente de liberação" toda venda do Mercado Livre cujo status
// de liberação ainda não é "released" (inclui nunca verificadas, onde o
// status fica null). Compartilhado com actions/liberacoes.ts (listagens da
// tela /liberacoes) para nunca divergir do critério usado aqui.
export function notReleasedCondition() {
  return and(
    eq(sales.source, "mercadolivre"),
    or(isNull(sales.moneyReleaseStatus), ne(sales.moneyReleaseStatus, "released"))
  );
}

export interface AtualizarLiberacoesResult {
  ok: boolean;
  message: string;
  updated: number;
  released: number;
}

/**
 * Lógica de verdade por trás do botão "Atualizar liberações": consulta a
 * data/status de liberação de todas as vendas ainda não marcadas como
 * liberadas (GET /v1/payments/$id, por mlPaymentId) e atualiza o banco, e de
 * quebra consulta também o status de envio de quem ainda não chegou a um
 * status final (ver comentário completo antigo em actions/liberacoes.ts).
 *
 * Fica aqui (em vez de dentro de actions/liberacoes.ts) porque esse arquivo
 * NÃO tem "use server": só assim pode ser chamado tanto pela Server Action
 * do botão (que roda dentro de uma requisição) quanto pelo job periódico em
 * instrumentation.ts (que roda em segundo plano, fora de qualquer
 * requisição — onde chamar revalidatePath quebraria). Por isso essa função
 * não chama revalidatePath: quem roda dentro de uma requisição faz isso por
 * conta própria depois (ver atualizarLiberacoes em actions/liberacoes.ts).
 */
export async function runAtualizarLiberacoes(): Promise<AtualizarLiberacoesResult> {
  const rows = await db.select().from(sales).where(notReleasedCondition());

  const withPaymentAndSeller = rows.filter(
    (row): row is typeof row & { mlPaymentId: string; mlSellerId: string } =>
      Boolean(row.mlPaymentId) && Boolean(row.mlSellerId)
  );
  const skippedIncomplete = rows.length - withPaymentAndSeller.length;

  if (withPaymentAndSeller.length === 0) {
    return {
      ok: true,
      updated: 0,
      released: 0,
      message:
        skippedIncomplete > 0
          ? `Nenhuma venda pôde ser verificada: ${skippedIncomplete} venda(s) pendente(s) sem conta e/ou pagamento identificado.`
          : "Nenhuma venda pendente de liberação para atualizar.",
    };
  }

  const bySeller = new Map<string, typeof withPaymentAndSeller>();
  for (const row of withPaymentAndSeller) {
    const list = bySeller.get(row.mlSellerId) ?? [];
    list.push(row);
    bySeller.set(row.mlSellerId, list);
  }

  let updated = 0;
  let released = 0;
  let shippingUpdated = 0;
  let delivered = 0;
  const errors: string[] = [];

  for (const [sellerId, sellerRows] of bySeller) {
    try {
      const accessToken = await getValidAccessTokenForAccount(sellerId);
      const paymentIds = Array.from(new Set(sellerRows.map((r) => r.mlPaymentId)));
      const info = await fetchPaymentReleaseInfo(paymentIds, accessToken);

      for (const row of sellerRows) {
        const releaseInfo = info.get(row.mlPaymentId);
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

      // Status de envio: só consulta de novo quem ainda não chegou a um
      // status final, e só quem tem o pedido identificado (mlOrderId).
      const needsShippingCheck = sellerRows.filter(
        (row): row is typeof row & { mlOrderId: string } =>
          Boolean(row.mlOrderId) &&
          !SHIPPING_STATUS_TERMINAL.includes(row.shippingStatus as (typeof SHIPPING_STATUS_TERMINAL)[number])
      );
      if (needsShippingCheck.length > 0) {
        const orderIds = Array.from(new Set(needsShippingCheck.map((r) => r.mlOrderId)));
        const shippingInfo = await fetchShippingStatusInfo(orderIds, accessToken);

        for (const row of needsShippingCheck) {
          const status = shippingInfo.get(row.mlOrderId);
          if (!status || status === row.shippingStatus) continue;
          await db
            .update(sales)
            .set({ shippingStatus: status, shippingStatusCheckedAt: new Date(), updatedAt: new Date() })
            .where(eq(sales.id, row.id));
          shippingUpdated += 1;
          if (status === "delivered") delivered += 1;
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "erro desconhecido");
    }
  }

  const skippedNote = skippedIncomplete > 0 ? ` (${skippedIncomplete} sem conta/pagamento identificado, ignorada(s))` : "";
  const shippingNote = shippingUpdated > 0 ? ` ${delivered} entrega(s) confirmada(s) agora.` : "";
  if (errors.length > 0) {
    return {
      ok: updated > 0,
      updated,
      released,
      message: `${updated} venda(s) verificada(s), ${released} já liberada(s)${skippedNote}.${shippingNote} Erros: ${errors.join("; ")}`,
    };
  }
  return {
    ok: true,
    updated,
    released,
    message: `${updated} venda(s) verificada(s), ${released} já liberada(s)${skippedNote}.${shippingNote}`,
  };
}
