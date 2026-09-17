// Correspondência determinística entre um item de linha de NF-e e um item
// de estoque já cadastrado — nunca "adivinha" por parecença, só casa
// quando há certeza razoável (EAN idêntico, ou nome idêntico ignorando
// maiúsculas/espaços). Qualquer coisa menos certa que isso vira "produto
// novo" em vez de arriscar ligar a compra ao item errado.
//
// Usado tanto pra pré-selecionar o item certo na tela de aprovação de
// NF-e quanto, se um dia fizer sentido, em qualquer outro lugar que
// precise da mesma regra.

export interface MatchableStockItem {
  id: string;
  name: string;
  ean: string | null;
}

export interface MatchableNfeItem {
  descricao: string;
  ean: string | null;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Retorna o id do item de estoque correspondente, ou null se não há
 * correspondência segura o suficiente (nesse caso a UI deve tratar como
 * "PRODUTO NOVO", nunca escolher por conta própria).
 */
export function matchStockItem(
  nfeItem: MatchableNfeItem,
  stockItems: MatchableStockItem[]
): string | null {
  if (nfeItem.ean) {
    const byEan = stockItems.find((item) => item.ean && item.ean === nfeItem.ean);
    if (byEan) return byEan.id;
  }

  const normalizedDescricao = normalizeName(nfeItem.descricao);
  const byName = stockItems.find((item) => normalizeName(item.name) === normalizedDescricao);
  if (byName) return byName.id;

  return null;
}

// Sentinela usado no <select> da tela de aprovação pra indicar "criar um
// item de estoque novo com esse item da nota" — nunca é um uuid de
// verdade, então não corre risco de colidir com um stockItemId real.
export const NOVO_PRODUTO_SENTINEL = "__novo__";
