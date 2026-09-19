import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pendingSales, sales, type Dispatcher, type PendingSale } from "@/db/schema";
import { getSettings } from "@/actions/settings";

/**
 * Extrai o ID do primeiro pagamento do payload bruto do pedido (salvo em
 * pending_sales.raw_order_payload), pra guardar em sales.mlPaymentId — é por
 * esse ID, não pelo order_id, que dá pra consultar a liberação do dinheiro
 * em GET /v1/payments/$id (ver actions/liberacoes.ts). Não faz uma chamada
 * nova à API: o payload do pedido já tem esse dado desde que foi
 * sincronizado/recebido pelo webhook.
 */
function extractFirstPaymentId(rawOrderPayload: unknown): string | null {
  if (!rawOrderPayload || typeof rawOrderPayload !== "object") return null;
  const payments = (rawOrderPayload as { payments?: unknown }).payments;
  if (!Array.isArray(payments) || payments.length === 0) return null;
  const first = payments[0];
  if (!first || typeof first !== "object") return null;
  const id = (first as { id?: unknown }).id;
  return id !== undefined && id !== null ? String(id) : null;
}

export interface CreateSaleFromPendingInput {
  pending: PendingSale;
  stockItemId: string;
  quantity: number;
  saleDate: string;
  dispatchedBy: Dispatcher;
  /** Custo TOTAL (não por unidade) da mercadoria dessa venda. */
  productCostManual: number;
  /**
   * true = confirmada sozinha pelo sistema via ad_title_mappings, sem
   * ninguém revisar em Pendentes. false = confirmação manual (fluxo normal).
   */
  autoConfirmed: boolean;
  /**
   * false só faz sentido junto com autoConfirmed: true — sinaliza que
   * `dispatchedBy` acima é um valor provisório e ainda precisa ser escolhido
   * de verdade na lista de "confirmadas automaticamente" (ver
   * actions/mercadolivre.ts: setDispatchedByForAutoConfirmedSale).
   */
  dispatchedByConfirmed: boolean;
}

/**
 * Cria a venda de verdade (tabela `sales`) a partir de uma venda pendente já
 * resolvida (produto de estoque, quantidade, custo e quem despacha já
 * decididos) e marca a pendência como confirmada — núcleo compartilhado
 * entre a confirmação manual (confirmPendingSale, em actions/mercadolivre.ts)
 * e a confirmação automática por vínculo memorizado
 * (tryAutoConfirmPendingSale, em lib/mercadolivre.ts), pra nunca divergir a
 * lógica de como uma venda do Mercado Livre vira uma venda "de verdade".
 */
export async function createSaleFromPendingSale(
  input: CreateSaleFromPendingInput
): Promise<{ saleId: string }> {
  const partnerSettings = await getSettings();
  const productCostManual = input.productCostManual.toFixed(2);

  const [createdSale] = await db
    .insert(sales)
    .values({
      productId: null,
      source: "mercadolivre",
      productNameSnapshot: input.pending.titleSnapshot,
      mlOrderId: input.pending.mlOrderId,
      mlSellerId: input.pending.mlSellerId,
      mlPaymentId: extractFirstPaymentId(input.pending.rawOrderPayload),
      mlPackId: input.pending.mlPackId,
      stockItemId: input.stockItemId,
      buyerNickname: input.pending.buyerNickname,
      buyerFullName: input.pending.buyerFullName,
      quantity: input.quantity,
      saleDate: input.saleDate,
      // Entra sempre como "pendente" — quem confirma a entrada não é
      // necessariamente quem despacha o pacote, então o Juan ou o Djow
      // marcam "despachado" manualmente em /vendas quando isso realmente
      // acontecer (ver updateSaleStatus em actions/sales.ts).
      orderStatus: "pendente",
      dispatchedBy: input.dispatchedBy,
      autoConfirmed: input.autoConfirmed,
      dispatchedByConfirmed: input.dispatchedByConfirmed,
      operationalFeePercentSnapshot: partnerSettings.operationalFeePercent.toString(),
      reservePercentSnapshot: partnerSettings.reservePercent.toString(),
      donationPercentSnapshot: partnerSettings.donationPercent.toString(),
      notes: input.autoConfirmed
        ? `Confirmado automaticamente (anúncio já mapeado) — pedido ${input.pending.mlOrderId}.`
        : `Importado do Mercado Livre — pedido ${input.pending.mlOrderId}.`,
      // Colunas do "modelo de receita" antigo (produto cadastrado) não se
      // aplicam a uma venda do Mercado Livre — preenchidas com valores
      // neutros só para satisfazer as colunas NOT NULL; withFinancials()
      // ignora todas elas quando source = "mercadolivre" e usa os valores
      // reais abaixo em vez disso.
      unitPriceSnapshot: input.pending.unitPriceSnapshot,
      kitQuantitySnapshot: 1,
      saleFeeTypeSnapshot: "fixo",
      saleFeeValueSnapshot: "0",
      freeShippingSnapshot: false,
      shippingCostSnapshot: "0",
      packagingCostSnapshot: "0",
      productCostSnapshot: "0",
      mlSaleFeeTotalSnapshot: input.pending.mlSaleFeeSnapshot,
      mlShippingTotalSnapshot: input.pending.mlShippingCostSnapshot,
      productCostManualSnapshot: productCostManual,
    })
    .returning({ id: sales.id });

  await db
    .update(pendingSales)
    .set({
      status: "confirmada",
      dispatchedBy: input.dispatchedBy,
      productCostManual,
      resultingSaleId: createdSale.id,
      updatedAt: new Date(),
    })
    .where(eq(pendingSales.id, input.pending.id));

  return { saleId: createdSale.id };
}
