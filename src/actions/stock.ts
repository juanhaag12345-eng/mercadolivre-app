"use server";

import { revalidatePath } from "next/cache";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { sales, stockItems, stockPurchases } from "@/db/schema";
import { stockItemSchema, stockPurchaseSchema } from "@/lib/validations";
import { toNumber } from "@/lib/calculations";
import type { ActionResult } from "@/actions/products";

export interface StockItemRow {
  id: string;
  internalCode: number;
  name: string;
  minStock: number;
  active: boolean;
  // Compras - vendas do Mercado Livre já ligadas a esse item (ver /pendentes)
  currentStock: number;
  lowStock: boolean;
}

/**
 * Lista os itens de estoque com a quantidade atual calculada na hora
 * (compras somadas menos vendas do Mercado Livre já ligadas ao item) — não
 * guardamos um saldo pronto no banco pra nunca correr o risco de ele
 * dessincronizar do histórico real de compras/vendas.
 */
export async function listStockItemsWithStock(opts: { onlyActive?: boolean } = {}): Promise<StockItemRow[]> {
  const [items, purchaseRows, saleRows] = await Promise.all([
    db.select().from(stockItems).orderBy(asc(stockItems.name)),
    db
      .select({ stockItemId: stockPurchases.stockItemId, quantity: stockPurchases.quantity })
      .from(stockPurchases),
    db
      .select({ stockItemId: sales.stockItemId, quantity: sales.quantity })
      .from(sales)
      .where(isNotNull(sales.stockItemId)),
  ]);

  const purchasedByItem = new Map<string, number>();
  for (const row of purchaseRows) {
    purchasedByItem.set(row.stockItemId, (purchasedByItem.get(row.stockItemId) ?? 0) + row.quantity);
  }
  const soldByItem = new Map<string, number>();
  for (const row of saleRows) {
    if (!row.stockItemId) continue;
    soldByItem.set(row.stockItemId, (soldByItem.get(row.stockItemId) ?? 0) + row.quantity);
  }

  const rows: StockItemRow[] = items.map((item) => {
    const currentStock = (purchasedByItem.get(item.id) ?? 0) - (soldByItem.get(item.id) ?? 0);
    return {
      id: item.id,
      internalCode: item.internalCode,
      name: item.name,
      minStock: item.minStock,
      active: item.active,
      currentStock,
      lowStock: currentStock <= item.minStock,
    };
  });

  return opts.onlyActive ? rows.filter((r) => r.active) : rows;
}

/** Itens com estoque baixo (ou zerado/negativo) — usado no card do dashboard. */
export async function getStockAlerts(): Promise<StockItemRow[]> {
  const rows = await listStockItemsWithStock({ onlyActive: true });
  return rows.filter((r) => r.lowStock).sort((a, b) => a.currentStock - b.currentStock);
}

function flattenErrors(error: import("zod").ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function createStockItem(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = stockItemSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    minStock: Number(formData.get("minStock") ?? 0),
  });
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };

  await db.insert(stockItems).values({
    name: parsed.data.name,
    minStock: parsed.data.minStock,
  });

  revalidatePath("/compras");
  revalidatePath("/pendentes");
  revalidatePath("/");
  return { ok: true };
}

export async function updateStockItem(
  id: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = stockItemSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    minStock: Number(formData.get("minStock") ?? 0),
  });
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };

  await db
    .update(stockItems)
    .set({ name: parsed.data.name, minStock: parsed.data.minStock, updatedAt: new Date() })
    .where(eq(stockItems.id, id));

  revalidatePath("/compras");
  revalidatePath("/pendentes");
  revalidatePath("/");
  return { ok: true };
}

export async function toggleStockItemActive(id: string, active: boolean) {
  await db.update(stockItems).set({ active, updatedAt: new Date() }).where(eq(stockItems.id, id));
  revalidatePath("/compras");
  revalidatePath("/pendentes");
}

export interface PurchaseRow {
  id: string;
  stockItemId: string;
  itemName: string;
  itemInternalCode: number;
  purchaseDate: string;
  supplier: string;
  unitCost: number;
  quantity: number;
  totalCost: number;
  paymentMethod: string;
}

export async function listPurchases(limit = 30): Promise<PurchaseRow[]> {
  const rows = await db
    .select({
      id: stockPurchases.id,
      stockItemId: stockPurchases.stockItemId,
      itemName: stockItems.name,
      itemInternalCode: stockItems.internalCode,
      purchaseDate: stockPurchases.purchaseDate,
      supplier: stockPurchases.supplier,
      unitCost: stockPurchases.unitCost,
      quantity: stockPurchases.quantity,
      paymentMethod: stockPurchases.paymentMethod,
    })
    .from(stockPurchases)
    .innerJoin(stockItems, eq(stockPurchases.stockItemId, stockItems.id))
    .orderBy(desc(stockPurchases.purchaseDate), desc(stockPurchases.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    unitCost: toNumber(row.unitCost),
    totalCost: toNumber(row.unitCost) * row.quantity,
  }));
}

export async function createPurchase(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = stockPurchaseSchema.safeParse({
    stockItemId: String(formData.get("stockItemId") ?? ""),
    purchaseDate: String(formData.get("purchaseDate") ?? ""),
    supplier: String(formData.get("supplier") ?? ""),
    unitCost: Number(formData.get("unitCost") ?? 0),
    quantity: Number(formData.get("quantity") ?? 1),
    paymentMethod: String(formData.get("paymentMethod") ?? ""),
  });
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };

  await db.insert(stockPurchases).values({
    stockItemId: parsed.data.stockItemId,
    purchaseDate: parsed.data.purchaseDate,
    supplier: parsed.data.supplier,
    unitCost: parsed.data.unitCost.toString(),
    quantity: parsed.data.quantity,
    paymentMethod: parsed.data.paymentMethod,
  });

  revalidatePath("/compras");
  revalidatePath("/pendentes");
  revalidatePath("/");
  return { ok: true };
}

export async function deletePurchase(id: string) {
  await db.delete(stockPurchases).where(eq(stockPurchases.id, id));
  revalidatePath("/compras");
  revalidatePath("/pendentes");
  revalidatePath("/");
}
