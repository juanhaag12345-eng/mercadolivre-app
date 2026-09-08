"use server";

import { asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { products, sales } from "@/db/schema";
import { toNumber } from "@/lib/calculations";

export interface SupplyCostRow {
  // Produtos do catálogo antigo usam o uuid; anúncios do Mercado Livre (sem
  // produto cadastrado) usam um id sintético "ml:<título>" — nunca colide
  // com um uuid real.
  id: string;
  internalCode: number | null;
  name: string;
  active: boolean;
  isKit: boolean;
  kitQuantity: number;
  // Custo unitário — cadastrado hoje no produto (catálogo antigo) ou média
  // do que foi preenchido manualmente em cada venda (anúncios do Mercado
  // Livre, onde o custo é sempre informado por venda, não por unidade).
  unitCost: number;
  // Unidades já vendidas (multiplicando pela qtd do kit, no catálogo antigo)
  unitsSold: number;
  // Quanto já foi gasto com fornecedor, somando o custo histórico (snapshot)
  // de cada venda registrada — não muda se o custo cadastrado for editado
  // depois.
  totalSpent: number;
}

/**
 * Custo de fornecimento: combina o catálogo antigo de produtos (custo
 * unitário cadastrado × unidades vendidas) com os anúncios do Mercado Livre
 * confirmados em /pendentes a partir de 01/09/2026 (onde não existe mais um
 * produto cadastrado — o custo é o que a pessoa preencheu, venda a venda, na
 * hora de confirmar a entrada).
 */
export async function getSupplyCostData(search?: string) {
  const [productRows, catalogSaleRows, mlSaleRows] = await Promise.all([
    db.select().from(products).orderBy(asc(products.name)),
    db
      .select({
        productId: sales.productId,
        quantity: sales.quantity,
        kitQuantitySnapshot: sales.kitQuantitySnapshot,
        productCostSnapshot: sales.productCostSnapshot,
      })
      .from(sales)
      .where(isNotNull(sales.productId)),
    db
      .select({
        titleSnapshot: sales.productNameSnapshot,
        quantity: sales.quantity,
        productCostManualSnapshot: sales.productCostManualSnapshot,
      })
      .from(sales)
      .where(eq(sales.source, "mercadolivre")),
  ]);

  const spendByProduct = new Map<string, { totalSpent: number; unitsSold: number }>();
  for (const sale of catalogSaleRows) {
    if (!sale.productId) continue;
    const kit = sale.kitQuantitySnapshot || 1;
    const unitCost = toNumber(sale.productCostSnapshot);
    const entry = spendByProduct.get(sale.productId) ?? { totalSpent: 0, unitsSold: 0 };
    entry.totalSpent += unitCost * kit * sale.quantity;
    entry.unitsSold += kit * sale.quantity;
    spendByProduct.set(sale.productId, entry);
  }

  const catalogRows: SupplyCostRow[] = productRows.map((p) => {
    const spend = spendByProduct.get(p.id) ?? { totalSpent: 0, unitsSold: 0 };
    return {
      id: p.id,
      internalCode: p.internalCode,
      name: p.name,
      active: p.active,
      isKit: p.isKit,
      kitQuantity: p.kitQuantity,
      unitCost: toNumber(p.productCost),
      unitsSold: spend.unitsSold,
      totalSpent: spend.totalSpent,
    };
  });

  // Anúncios do Mercado Livre não têm um produto cadastrado — agrupamos pelo
  // próprio título do anúncio (mesma lógica usada no dashboard para "anúncios
  // mais vendidos").
  const spendByTitle = new Map<string, { totalSpent: number; unitsSold: number }>();
  for (const sale of mlSaleRows) {
    const entry = spendByTitle.get(sale.titleSnapshot) ?? { totalSpent: 0, unitsSold: 0 };
    entry.totalSpent += toNumber(sale.productCostManualSnapshot);
    entry.unitsSold += sale.quantity;
    spendByTitle.set(sale.titleSnapshot, entry);
  }

  const mlRows: SupplyCostRow[] = Array.from(spendByTitle.entries()).map(([title, spend]) => ({
    id: `ml:${title}`,
    internalCode: null,
    name: title,
    active: true,
    isKit: false,
    kitQuantity: 1,
    unitCost: spend.unitsSold > 0 ? spend.totalSpent / spend.unitsSold : 0,
    unitsSold: spend.unitsSold,
    totalSpent: spend.totalSpent,
  }));

  const allRows = [...catalogRows, ...mlRows];

  // O total geral considera todos os produtos/anúncios, independente da
  // busca — é a visão geral do negócio, não deve sumir quando a pessoa
  // filtra por um nome específico.
  const totalSpentAll = allRows.reduce((sum, r) => sum + r.totalSpent, 0);
  const totalProducts = allRows.length;

  const rows = search
    ? allRows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : allRows;

  // Maior gasto acumulado primeiro — mostra de cara quais produtos/anúncios
  // pesam mais no custo de fornecimento.
  rows.sort((a, b) => b.totalSpent - a.totalSpent);

  return { rows, totalSpentAll, totalProducts };
}
