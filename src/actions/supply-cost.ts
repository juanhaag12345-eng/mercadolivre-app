"use server";

import { asc, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { products, sales } from "@/db/schema";
import { toNumber } from "@/lib/calculations";

export interface SupplyCostRow {
  id: string;
  internalCode: number;
  name: string;
  active: boolean;
  isKit: boolean;
  kitQuantity: number;
  // Custo unitário cadastrado hoje no produto (o que estou pagando por unidade agora)
  unitCost: number;
  // Unidades já vendidas desse produto (multiplicando pela qtd do kit)
  unitsSold: number;
  // Quanto já foi gasto com fornecedor nesse produto, somando o custo
  // histórico (snapshot) de cada venda registrada — não muda se o custo
  // cadastrado no produto for editado depois.
  totalSpent: number;
}

/**
 * Custo de fornecimento por produto: custo unitário cadastrado hoje +
 * quanto já foi efetivamente gasto com aquele produto, com base no
 * histórico de vendas (snapshot financeiro de cada venda, respeitando o
 * mesmo princípio de isolamento usado no resto do app — editar o produto
 * não altera retroativamente o que já foi gasto).
 */
export async function getSupplyCostData(search?: string) {
  const [productRows, saleRows] = await Promise.all([
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
  ]);

  const spendByProduct = new Map<string, { totalSpent: number; unitsSold: number }>();
  for (const sale of saleRows) {
    if (!sale.productId) continue;
    const kit = sale.kitQuantitySnapshot || 1;
    const unitCost = toNumber(sale.productCostSnapshot);
    const entry = spendByProduct.get(sale.productId) ?? { totalSpent: 0, unitsSold: 0 };
    entry.totalSpent += unitCost * kit * sale.quantity;
    entry.unitsSold += kit * sale.quantity;
    spendByProduct.set(sale.productId, entry);
  }

  const allRows: SupplyCostRow[] = productRows.map((p) => {
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

  // O total geral considera todos os produtos cadastrados, independente da
  // busca — é a visão geral do negócio, não deve sumir quando a pessoa
  // filtra por um produto específico.
  const totalSpentAll = allRows.reduce((sum, r) => sum + r.totalSpent, 0);
  const totalProducts = allRows.length;

  const rows = search
    ? allRows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : allRows;

  // Maior gasto acumulado primeiro — mostra de cara quais produtos pesam
  // mais no custo de fornecimento.
  rows.sort((a, b) => b.totalSpent - a.totalSpent);

  return { rows, totalSpentAll, totalProducts };
}
