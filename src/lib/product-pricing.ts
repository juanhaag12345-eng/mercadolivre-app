import type { SaleUnitType } from "@/db/schema";

// Conversão entre o preço de custo "como a pessoa digita" no cadastro de um
// produto (por unidade se ele é vendido "unitário", ou pelo pacote inteiro
// se é display/conjunto/caixa) e o preço de referência que guardamos no
// banco, sempre por unidade — assim o resto do sistema (alerta de estoque,
// histórico de compras) nunca precisa saber em que tipo de pacote o produto
// veio.

/** Converte o valor digitado (do pacote inteiro, se aplicável) pro preço de referência por unidade. Nunca inventa um valor: sem nada digitado, o resultado é null. */
export function toReferenceCostPrice(
  saleUnitType: SaleUnitType,
  unitsPerPackage: number,
  costPriceInput: number | null | undefined
): number | null {
  if (costPriceInput === null || costPriceInput === undefined || !Number.isFinite(costPriceInput)) {
    return null;
  }
  const units = saleUnitType === "unitario" ? 1 : Math.max(1, Math.trunc(unitsPerPackage) || 1);
  return Math.round((costPriceInput / units) * 100) / 100;
}

/** Inverso de toReferenceCostPrice — reconstrói o valor "como digitado" a partir do preço de referência guardado, pra pré-preencher o formulário de edição. */
export function fromReferenceCostPrice(
  saleUnitType: SaleUnitType,
  unitsPerPackage: number,
  referenceCostPrice: number | null
): number {
  if (referenceCostPrice === null || !Number.isFinite(referenceCostPrice)) return 0;
  const units = saleUnitType === "unitario" ? 1 : Math.max(1, Math.trunc(unitsPerPackage) || 1);
  return Math.round(referenceCostPrice * units * 100) / 100;
}
