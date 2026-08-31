import type { SaleFeeType } from "@/db/schema";

export interface FinancialInputs {
  unitPrice: number;
  kitQuantity: number;
  saleFeeType: SaleFeeType;
  saleFeeValue: number;
  shippingCost: number;
  packagingCost: number;
  productCost: number;
  quantity?: number;
}

export interface FinancialBreakdown {
  revenue: number;
  saleFeeAmount: number;
  shippingTotal: number;
  packagingTotal: number;
  productCostTotal: number;
  totalCost: number;
  profit: number;
  marginPercent: number;
}

/**
 * Calcula receita, custos, lucro e margem de uma venda (ou de uma prévia de
 * cadastro de produto) a partir dos valores financeiros informados.
 *
 * Regras assumidas (ajustáveis conforme feedback):
 * - unitPrice é o valor de venda de 1 unidade do produto; o valor total da
 *   venda é unitPrice * kitQuantity (ex: kit de 3 nutellas).
 * - productCost é o custo de aquisição por unidade, também multiplicado pela
 *   quantidade do kit.
 * - packagingCost e shippingCost são por envio (não multiplicam pelo kit,
 *   pois um kit vai em uma única embalagem/etiqueta de envio).
 * - quantity é o número de vezes que essa mesma venda se repete (ex: vendeu
 *   o mesmo kit 2x no mesmo dia); tudo escala por ela.
 */
export function calculateFinancials(inputs: FinancialInputs): FinancialBreakdown {
  const quantity = inputs.quantity ?? 1;
  const kitQuantity = Math.max(1, inputs.kitQuantity || 1);

  const revenue = inputs.unitPrice * kitQuantity * quantity;

  const saleFeeAmount =
    inputs.saleFeeType === "percentual"
      ? revenue * (inputs.saleFeeValue / 100)
      : inputs.saleFeeValue * quantity;

  const shippingTotal = inputs.shippingCost * quantity;
  const packagingTotal = inputs.packagingCost * quantity;
  const productCostTotal = inputs.productCost * kitQuantity * quantity;

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

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
