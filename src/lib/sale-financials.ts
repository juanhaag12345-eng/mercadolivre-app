import type { sales } from "@/db/schema";
import { calculateFinancials, computePartnerSplit, toNumber } from "@/lib/calculations";

export function withFinancials(sale: typeof sales.$inferSelect) {
  const breakdown = calculateFinancials({
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
    operationalFeePercent: toNumber(sale.operationalFeePercentSnapshot),
    reservePercent: toNumber(sale.reservePercentSnapshot),
    dispatchedBy: sale.dispatchedBy,
  });
  return { ...sale, ...breakdown, ...partnerSplit };
}

export type SaleWithFinancials = ReturnType<typeof withFinancials>;
