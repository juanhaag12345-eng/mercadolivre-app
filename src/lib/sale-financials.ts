import type { sales } from "@/db/schema";
import { calculateFinancials, toNumber } from "@/lib/calculations";

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
  return { ...sale, ...breakdown };
}

export type SaleWithFinancials = ReturnType<typeof withFinancials>;
