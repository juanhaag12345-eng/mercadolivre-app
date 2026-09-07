import type { Product } from "@/db/schema";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}

function words(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/**
 * Sugere produtos cadastrados que provavelmente correspondem ao título de um
 * anúncio do Mercado Livre — a correspondência exata por nome não é
 * confiável (o título do anúncio quase nunca é idêntico ao nome cadastrado),
 * então usamos uma pontuação simples por sobreposição de palavras.
 *
 * Retorna os produtos ordenados do mais provável para o menos provável;
 * produtos sem nenhuma palavra em comum ficam no fim (pontuação 0), para que
 * a pessoa ainda consiga escolher manualmente numa lista completa.
 */
export function suggestProducts(mlTitle: string, products: Product[]): Product[] {
  const titleWords = new Set(words(mlTitle));
  if (titleWords.size === 0) return products;

  const scored = products.map((product) => {
    const productWords = words(product.name);
    const overlap = productWords.filter((w) => titleWords.has(w)).length;
    // Normaliza pelo tamanho do nome do produto, para não favorecer nomes
    // muito longos só por terem mais chance de bater alguma palavra à toa.
    const score = productWords.length > 0 ? overlap / productWords.length : 0;
    return { product, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.product);
}
