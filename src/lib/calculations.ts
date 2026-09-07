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
  // Lucro da venda (o "profit" de calculateFinancials) — base de TODOS os
  // percentuais abaixo (doação, reserva e remuneração operacional).
  profit: number;
  revenue: number;
  // % do lucro separado para igreja/doação, retirado ANTES de qualquer
  // outra divisão — reserva, remuneração operacional e sócios são todos
  // calculados sobre o que sobra depois da doação.
  donationPercent: number;
  // % do lucro (já descontada a doação) pago a quem despachou, pela
  // execução da venda. Sai do valor distribuível (não é somado por fora
  // nem tirado da reserva).
  operationalFeePercent: number;
  // % do lucro (já descontada a doação) que fica de reserva na empresa
  reservePercent: number;
  dispatchedBy: Dispatcher;
}

export interface PartnerSplitBreakdown {
  // Fatia separada para igreja/doação — sai primeiro, sobre o lucro cheio
  donationAmount: number;
  // Remuneração operacional: sai do valor distribuível, inteira pra quem despachou
  operationalFee: number;
  reserveAmount: number;
  // O que sobra pra dividir 50/50 entre os sócios, já descontada a doação,
  // a reserva e a remuneração operacional
  distributableAmount: number;
  // Metade do distribuível — vai igual pros dois, independente de quem despachou
  partnerShare: number;
  // Quanto cada sócio embolsa NESSA venda: metade do distribuível + a
  // remuneração operacional inteira, só para quem despachou.
  // donationAmount + reserveAmount + juanTotal + djowTotal fecha exatamente
  // no lucro da venda.
  juanTotal: number;
  djowTotal: number;
}

/**
 * Divide o lucro de uma venda entre doação, reserva da empresa e os dois
 * sócios. A doação sai primeiro, sempre um % do lucro cheio da venda:
 * donationAmount = lucro × donationPercent. Reserva e remuneração
 * operacional são um % do que sobra depois da doação (nunca do lucro
 * cheio nem da receita): reserva = restante × reservePercent; remuneração
 * operacional = restante × operationalFeePercent, paga inteira a quem
 * despachou; o que sobra é dividido 50/50 entre os sócios. A soma das
 * quatro partes (doação + reserva + Juan + Djow) fecha no lucro da venda.
 */
export function computePartnerSplit(inputs: PartnerSplitInputs): PartnerSplitBreakdown {
  const donationAmount = inputs.profit * (inputs.donationPercent / 100);
  const remainingProfit = inputs.profit - donationAmount;

  const reserveAmount = remainingProfit * (inputs.reservePercent / 100);
  const operationalFee = remainingProfit * (inputs.operationalFeePercent / 100);
  const distributableAmount = remainingProfit - reserveAmount - operationalFee;
  const partnerShare = distributableAmount / 2;

  const juanTotal = partnerShare + (inputs.dispatchedBy === "juan" ? operationalFee : 0);
  const djowTotal = partnerShare + (inputs.dispatchedBy === "djow" ? operationalFee : 0);

  return {
    donationAmount,
    operationalFee,
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
