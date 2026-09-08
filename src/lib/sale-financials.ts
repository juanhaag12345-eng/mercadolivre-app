import type { sales } from "@/db/schema";
import {
  calculateFinancials,
  computePartnerSplit,
  toNumber,
  type FinancialBreakdown,
} from "@/lib/calculations";

/**
 * Breakdown de uma venda importada do Mercado Livre: diferente do fluxo
 * manual (que reconstrói a receita a partir de uma "receita" configurável —
 * preço unitário × qtd kit × taxa %), aqui a receita, a tarifa de venda e o
 * frete já são valores REAIS e totais, prontos, vindos do Mercado Livre no
 * momento da confirmação — não há nada a calcular a partir de uma taxa
 * percentual ou de kit. Só o custo do produto é manual.
 */
function mercadolivreBreakdown(sale: typeof sales.$inferSelect): FinancialBreakdown {
  const revenue = toNumber(sale.unitPriceSnapshot) * sale.quantity;
  const saleFeeAmount = toNumber(sale.mlSaleFeeTotalSnapshot);
  const shippingTotal = toNumber(sale.mlShippingTotalSnapshot);
  const packagingTotal = 0;
  const productCostTotal = toNumber(sale.productCostManualSnapshot);

  const totalCost = saleFeeAmount + shippingTotal + packagingTotal + productCostTotal;
  const profit = revenue - totalCost;
  const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;

  return {
    revenue,
    saleFeeAmount,
    shippingTotal,
    packagingTotal,
    productCostTotal,
    totalCost,
    profit,
    marginPercent,
  };
}

export function withFinancials(sale: typeof sales.$inferSelect) {
  const breakdown =
    sale.source === "mercadolivre"
      ? mercadolivreBreakdown(sale)
      : calculateFinancials({
          unitPrice: toNumber(sale.unitPriceSnapshot),
          kitQuantity: sale.kitQuantitySnapshot,
          saleFeeType: sale.saleFeeTypeSnapshot,
          saleFeeValue: toNumber(sale.saleFeeValueSnapshot),
          shippingCost: toNumber(sale.shippingCostSnapshot),
          packagingCost: toNumber(sale.packagingCostSnapshot),
          productCost: toNumber(sale.productCostSnapshot),
          quantity: sale.quantity,
        });
  const partnerSplit = computePartnerSplit({
    profit: breakdown.profit,
    revenue: breakdown.revenue,
    donationPercent: toNumber(sale.donationPercentSnapshot),
    operationalFeePercent: toNumber(sale.operationalFeePercentSnapshot),
    reservePercent: toNumber(sale.reservePercentSnapshot),
    dispatchedBy: sale.dispatchedBy,
  });
  return { ...sale, ...breakdown, ...partnerSplit };
}

export type SaleWithFinancials = ReturnType<typeof withFinancials>;
