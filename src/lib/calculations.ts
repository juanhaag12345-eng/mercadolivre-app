import type { Dispatcher, SaleFeeType } from "@/db/schema";

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

export interface PartnerSplitInputs {
  // Lucro da venda ANTES da remuneração operacional (o "profit" de calculateFinancials)
  profit: number;
  revenue: number;
  // % da receita pago a quem despachou, pela execução + custo operacional
  operationalFeePercent: number;
  // % do lucro (já descontada a remuneração operacional) que fica de reserva na empresa
  reservePercent: number;
  dispatchedBy: Dispatcher;
}

export interface PartnerSplitBreakdown {
  operationalFee: number;
  // Lucro da venda depois de descontar a remuneração operacional
  profitAfterOperational: number;
  reserveAmount: number;
  // O que sobra pra dividir 50/50 entre os sócios
  distributableAmount: number;
  // Metade do distribuível — vai igual pros dois, independente de quem despachou
  partnerShare: number;
  // Quanto cada sócio embolsa NESSA venda: metade do distribuível + a
  // remuneração operacional inteira, só para quem despachou
  juanTotal: number;
  djowTotal: number;
}

/**
 * Divide o lucro de uma venda entre reserva da empresa e os dois sócios,
 * seguindo o fluxo: receita → lucro da venda → (- remuneração operacional
 * de quem despachou) → (- reserva da empresa) → resto dividido 50/50.
 */
export function computePartnerSplit(inputs: PartnerSplitInputs): PartnerSplitBreakdown {
  const operationalFee = inputs.revenue * (inputs.operationalFeePercent / 100);
  const profitAfterOperational = inputs.profit - operationalFee;
  const reserveAmount = profitAfterOperational * (inputs.reservePercent / 100);
  const distributableAmount = profitAfterOperational - reserveAmount;
  const partnerShare = distributableAmount / 2;

  const juanTotal = partnerShare + (inputs.dispatchedBy === "juan" ? operationalFee : 0);
  const djowTotal = partnerShare + (inputs.dispatchedBy === "djow" ? operationalFee : 0);

  return {
    operationalFee,
    profitAfterOperational,
    reserveAmount,
    distributableAmount,
    partnerShare,
    juanTotal,
    djowTotal,
  };
}

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
