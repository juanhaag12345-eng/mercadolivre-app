"use server";

import { revalidatePath } from "next/cache";
import { asc, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { sales, stockItems, stockPurchases, type PaymentStatus, type SaleUnitType } from "@/db/schema";
import { stockItemSchema, stockPurchaseSchema } from "@/lib/validations";
import { toNumber } from "@/lib/calculations";
import { addDays, daysBetweenInclusive } from "@/lib/dates";
import { todayISO } from "@/lib/format";
import { toReferenceCostPrice } from "@/lib/product-pricing";
import type { ActionResult } from "@/actions/products";

export interface StockItemRow {
  id: string;
  internalCode: number;
  name: string;
  ean: string | null;
  minStock: number;
  saleUnitType: SaleUnitType;
  unitsPerPackage: number;
  referenceCostPrice: number | null;
  active: boolean;
  criadoAutomaticamente: boolean;
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
      ean: item.ean,
      minStock: item.minStock,
      saleUnitType: item.saleUnitType,
      unitsPerPackage: item.unitsPerPackage,
      referenceCostPrice: item.referenceCostPrice !== null ? toNumber(item.referenceCostPrice) : null,
      active: item.active,
      criadoAutomaticamente: item.criadoAutomaticamente,
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

/** Itens sem estoque nenhum (zero ou negativo) — subconjunto mais urgente dos de estoque baixo. */
export async function getOutOfStockItems(): Promise<StockItemRow[]> {
  const rows = await listStockItemsWithStock({ onlyActive: true });
  return rows.filter((r) => r.currentStock <= 0).sort((a, b) => a.currentStock - b.currentStock);
}

function flattenErrors(error: import("zod").ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function parseStockItemForm(formData: FormData) {
  const rawCost = formData.get("costPriceInput");
  return {
    name: String(formData.get("name") ?? ""),
    ean: String(formData.get("ean") ?? ""),
    minStock: Number(formData.get("minStock") ?? 0),
    saleUnitType: String(formData.get("saleUnitType") ?? "unitario"),
    unitsPerPackage: Number(formData.get("unitsPerPackage") ?? 1),
    // vazio = sem preço de referência ainda (não é o mesmo que custo zero)
    costPriceInput: rawCost !== null && String(rawCost).trim() !== "" ? Number(rawCost) : undefined,
  };
}

export async function createStockItem(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = stockItemSchema.safeParse(parseStockItemForm(formData));
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };

  const referenceCostPrice = toReferenceCostPrice(
    parsed.data.saleUnitType,
    parsed.data.unitsPerPackage,
    parsed.data.costPriceInput
  );

  // internalCode não é mais `serial` (ver comentário no schema) — calculamos
  // o próximo número dentro da transação (MAX + 1) pra sempre preencher o
  // buraco deixado por uma exclusão em vez de pular números.
  await db.transaction(async (tx) => {
    const [{ maxCode }] = await tx
      .select({ maxCode: sql<number>`coalesce(max(${stockItems.internalCode}), 0)` })
      .from(stockItems);

    await tx.insert(stockItems).values({
      internalCode: maxCode + 1,
      name: parsed.data.name,
      ean: parsed.data.ean || null,
      minStock: parsed.data.minStock,
      saleUnitType: parsed.data.saleUnitType,
      unitsPerPackage: parsed.data.saleUnitType === "unitario" ? 1 : parsed.data.unitsPerPackage,
      referenceCostPrice: referenceCostPrice !== null ? referenceCostPrice.toString() : null,
    });
  });

  revalidatePath("/compras");
  revalidatePath("/cadastro-produtos");
  revalidatePath("/pendentes");
  revalidatePath("/notas-fiscais");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Exclui definitivamente um item de estoque — diferente de `toggleStockItemActive`,
 * que só desativa mantendo o histórico. Só permite excluir quando não há
 * nenhuma compra ou venda ligada ao item (pra nunca apagar histórico real);
 * quando há, retorna erro orientando a desativar em vez de excluir.
 *
 * Depois de excluir, renumera o `internalCode` de todos os itens seguintes
 * (decrementa em 1 os que eram maiores que o do item excluído) pra fechar o
 * buraco — ex: excluir o #1 faz o #2 virar #1, o #3 virar #2, etc.
 */
export async function deleteStockItem(id: string): Promise<{ ok: boolean; message?: string }> {
  const [item] = await db.select().from(stockItems).where(eq(stockItems.id, id)).limit(1);
  if (!item) return { ok: false, message: "Esse item não existe mais." };

  const [purchaseRows, saleRows] = await Promise.all([
    db.select({ id: stockPurchases.id }).from(stockPurchases).where(eq(stockPurchases.stockItemId, id)).limit(1),
    db.select({ id: sales.id }).from(sales).where(eq(sales.stockItemId, id)).limit(1),
  ]);

  if (purchaseRows.length > 0 || saleRows.length > 0) {
    return {
      ok: false,
      message: `Não é possível excluir "${item.name}" porque já existe compra e/ou venda registrada com ele — isso apagaria histórico real. Desative o item em vez de excluir (ele some das opções de seleção, mas o histórico continua intacto).`,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(stockItems).where(eq(stockItems.id, id));
    await tx
      .update(stockItems)
      .set({ internalCode: sql`${stockItems.internalCode} - 1` })
      .where(gt(stockItems.internalCode, item.internalCode));
  });

  revalidatePath("/compras");
  revalidatePath("/cadastro-produtos");
  revalidatePath("/pendentes");
  revalidatePath("/notas-fiscais");
  revalidatePath("/");
  return { ok: true };
}

export async function updateStockItem(
  id: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = stockItemSchema.safeParse(parseStockItemForm(formData));
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };

  const referenceCostPrice = toReferenceCostPrice(
    parsed.data.saleUnitType,
    parsed.data.unitsPerPackage,
    parsed.data.costPriceInput
  );

  await db
    .update(stockItems)
    .set({
      name: parsed.data.name,
      ean: parsed.data.ean || null,
      minStock: parsed.data.minStock,
      saleUnitType: parsed.data.saleUnitType,
      unitsPerPackage: parsed.data.saleUnitType === "unitario" ? 1 : parsed.data.unitsPerPackage,
      referenceCostPrice: referenceCostPrice !== null ? referenceCostPrice.toString() : null,
      updatedAt: new Date(),
    })
    .where(eq(stockItems.id, id));

  revalidatePath("/compras");
  revalidatePath("/cadastro-produtos");
  revalidatePath("/pendentes");
  revalidatePath("/notas-fiscais");
  revalidatePath("/");
  return { ok: true };
}

export async function toggleStockItemActive(id: string, active: boolean) {
  await db.update(stockItems).set({ active, updatedAt: new Date() }).where(eq(stockItems.id, id));
  revalidatePath("/compras");
  revalidatePath("/cadastro-produtos");
  revalidatePath("/pendentes");
}

/** Dispensa o aviso "PRODUTO NOVO" de um item criado automaticamente a partir de uma NF-e. */
export async function dismissNovoStockItem(id: string) {
  await db.update(stockItems).set({ criadoAutomaticamente: false, updatedAt: new Date() }).where(eq(stockItems.id, id));
  revalidatePath("/compras");
  revalidatePath("/cadastro-produtos");
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
  origem: "nf" | "sem_nf";
  notaFiscalNumero: string | null;
  produtoNovo: boolean;
  paymentTermDays: number;
  dueDate: string | null;
  paymentStatus: PaymentStatus;
  observacao: string | null;
}

export type PurchaseFilter = "todas" | "nf" | "sem_nf" | "pendente" | "pago";

export async function listPurchases(opts: { limit?: number; filtro?: PurchaseFilter } = {}): Promise<PurchaseRow[]> {
  const { limit = 200, filtro = "todas" } = opts;

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
      origem: stockPurchases.origem,
      notaFiscalNumero: stockPurchases.notaFiscalNumero,
      produtoNovo: stockPurchases.produtoNovo,
      paymentTermDays: stockPurchases.paymentTermDays,
      dueDate: stockPurchases.dueDate,
      paymentStatus: stockPurchases.paymentStatus,
      observacao: stockPurchases.observacao,
    })
    .from(stockPurchases)
    .innerJoin(stockItems, eq(stockPurchases.stockItemId, stockItems.id))
    .orderBy(desc(stockPurchases.purchaseDate), desc(stockPurchases.createdAt))
    .limit(limit);

  const mapped = rows.map((row) => ({
    ...row,
    unitCost: toNumber(row.unitCost),
    totalCost: toNumber(row.unitCost) * row.quantity,
  }));

  switch (filtro) {
    case "nf":
      return mapped.filter((r) => r.origem === "nf");
    case "sem_nf":
      return mapped.filter((r) => r.origem === "sem_nf");
    case "pendente":
      return mapped.filter((r) => r.paymentStatus === "pendente");
    case "pago":
      return mapped.filter((r) => r.paymentStatus === "pago");
    default:
      return mapped;
  }
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
    paymentTermDays: Number(formData.get("paymentTermDays") ?? 0),
    observacao: String(formData.get("observacao") ?? ""),
  });
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };

  const dueDate = addDays(parsed.data.purchaseDate, parsed.data.paymentTermDays);

  await db.insert(stockPurchases).values({
    stockItemId: parsed.data.stockItemId,
    purchaseDate: parsed.data.purchaseDate,
    supplier: parsed.data.supplier,
    unitCost: parsed.data.unitCost.toString(),
    quantity: parsed.data.quantity,
    paymentMethod: parsed.data.paymentMethod,
    // Toda compra cadastrada por esse formulário (Compras → "Nova compra
    // sem NF") é sem_nf — o único jeito de gravar origem "nf" é aprovando
    // a nota em /notas-fiscais (ver actions/nfe.ts).
    origem: "sem_nf",
    paymentTermDays: parsed.data.paymentTermDays,
    dueDate,
    observacao: parsed.data.observacao || null,
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

export async function setPurchasePaymentStatus(id: string, status: PaymentStatus) {
  await db
    .update(stockPurchases)
    .set({ paymentStatus: status, paidAt: status === "pago" ? new Date() : null })
    .where(eq(stockPurchases.id, id));
  revalidatePath("/compras");
  revalidatePath("/");
}

export interface UpcomingPaymentRow {
  id: string;
  itemName: string;
  supplier: string;
  totalCost: number;
  dueDate: string;
  daysUntilDue: number;
  overdue: boolean;
  paymentMethod: string;
}

/**
 * Compras ainda não pagas com prazo definido, ordenadas pela data de
 * vencimento — usado no card "Pagamentos próximos" do dashboard. Inclui
 * também as já vencidas (daysUntilDue negativo), pra não deixar passar
 * batido.
 */
export async function getUpcomingPayments(limit = 8): Promise<UpcomingPaymentRow[]> {
  const rows = await db
    .select({
      id: stockPurchases.id,
      itemName: stockItems.name,
      supplier: stockPurchases.supplier,
      unitCost: stockPurchases.unitCost,
      quantity: stockPurchases.quantity,
      dueDate: stockPurchases.dueDate,
      paymentMethod: stockPurchases.paymentMethod,
    })
    .from(stockPurchases)
    .innerJoin(stockItems, eq(stockPurchases.stockItemId, stockItems.id))
    .where(eq(stockPurchases.paymentStatus, "pendente"));

  const today = todayISO();
  return rows
    .filter((r): r is typeof r & { dueDate: string } => Boolean(r.dueDate))
    .map((r) => ({
      id: r.id,
      itemName: r.itemName,
      supplier: r.supplier,
      totalCost: toNumber(r.unitCost) * r.quantity,
      dueDate: r.dueDate,
      daysUntilDue: daysBetweenInclusive(today, r.dueDate) - 1,
      overdue: r.dueDate < today,
      paymentMethod: r.paymentMethod,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit);
}

export interface PriceStats {
  min: number;
  max: number;
  last: number;
  avg: number;
  lastSupplier: string;
  lastOrigem: "nf" | "sem_nf";
}

export interface PriceChartPoint {
  label: string;
  avgPrice: number | null;
  quantitySold: number;
}

export interface StockItemAnalytics {
  history: PurchaseRow[];
  stats: PriceStats | null;
  chart: PriceChartPoint[];
}

const CHART_MONTHS_BACK = 6;
const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function lastNYearMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function monthLabelAbbr(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]}/${String(y).slice(2)}`;
}

/**
 * Histórico de compras, estatísticas de preço (mín/máx/último/médio) e uma
 * série mensal de preço médio de compra x quantidade vendida, por item de
 * estoque — usado no detalhe de cada item em Compras (histórico de preços
 * + gráfico de preço x vendas). Calculado tudo de uma vez pra tela inteira
 * em vez de uma consulta por item, já que o catálogo é pequeno.
 */
export async function getStockAnalytics(): Promise<Record<string, StockItemAnalytics>> {
  const months = lastNYearMonths(CHART_MONTHS_BACK);
  const monthIndex = new Map(months.map((m, i) => [m, i]));

  const [purchases, salesRows] = await Promise.all([
    db
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
        origem: stockPurchases.origem,
        notaFiscalNumero: stockPurchases.notaFiscalNumero,
        produtoNovo: stockPurchases.produtoNovo,
        paymentTermDays: stockPurchases.paymentTermDays,
        dueDate: stockPurchases.dueDate,
        paymentStatus: stockPurchases.paymentStatus,
        observacao: stockPurchases.observacao,
      })
      .from(stockPurchases)
      .innerJoin(stockItems, eq(stockPurchases.stockItemId, stockItems.id))
      .orderBy(desc(stockPurchases.purchaseDate), desc(stockPurchases.createdAt)),
    db
      .select({ stockItemId: sales.stockItemId, quantity: sales.quantity, saleDate: sales.saleDate })
      .from(sales)
      .where(isNotNull(sales.stockItemId)),
  ]);

  const byItem = new Map<string, PurchaseRow[]>();
  for (const row of purchases) {
    const mapped: PurchaseRow = {
      ...row,
      unitCost: toNumber(row.unitCost),
      totalCost: toNumber(row.unitCost) * row.quantity,
    };
    const list = byItem.get(row.stockItemId) ?? [];
    list.push(mapped);
    byItem.set(row.stockItemId, list);
  }

  // Preço médio de compra por item x mês (só meses com pelo menos uma
  // compra registrada — meses sem compra ficam com avgPrice nulo no
  // gráfico, sem inventar um valor).
  const priceByItemMonth = new Map<string, Map<number, { sum: number; count: number }>>();
  for (const row of purchases) {
    const ym = row.purchaseDate.slice(0, 7);
    const idx = monthIndex.get(ym);
    if (idx === undefined) continue;
    const perMonth = priceByItemMonth.get(row.stockItemId) ?? new Map();
    const entry = perMonth.get(idx) ?? { sum: 0, count: 0 };
    entry.sum += toNumber(row.unitCost);
    entry.count += 1;
    perMonth.set(idx, entry);
    priceByItemMonth.set(row.stockItemId, perMonth);
  }

  // Quantidade vendida por item x mês.
  const salesByItemMonth = new Map<string, Map<number, number>>();
  for (const row of salesRows) {
    if (!row.stockItemId) continue;
    const ym = row.saleDate.slice(0, 7);
    const idx = monthIndex.get(ym);
    if (idx === undefined) continue;
    const perMonth = salesByItemMonth.get(row.stockItemId) ?? new Map();
    perMonth.set(idx, (perMonth.get(idx) ?? 0) + row.quantity);
    salesByItemMonth.set(row.stockItemId, perMonth);
  }

  const result: Record<string, StockItemAnalytics> = {};
  const allItemIds = new Set<string>([...byItem.keys(), ...salesByItemMonth.keys()]);
  for (const itemId of allItemIds) {
    const history = byItem.get(itemId) ?? [];
    let stats: PriceStats | null = null;
    if (history.length > 0) {
      const costs = history.map((h) => h.unitCost);
      const sorted = [...history].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
      stats = {
        min: Math.min(...costs),
        max: Math.max(...costs),
        last: sorted[0].unitCost,
        avg: costs.reduce((a, b) => a + b, 0) / costs.length,
        lastSupplier: sorted[0].supplier,
        lastOrigem: sorted[0].origem,
      };
    }

    const priceMonths = priceByItemMonth.get(itemId);
    const saleMonths = salesByItemMonth.get(itemId);
    const chart: PriceChartPoint[] = months.map((ym, idx) => {
      const priceEntry = priceMonths?.get(idx);
      return {
        label: monthLabelAbbr(ym),
        avgPrice: priceEntry ? Math.round((priceEntry.sum / priceEntry.count) * 100) / 100 : null,
        quantitySold: saleMonths?.get(idx) ?? 0,
      };
    });

    result[itemId] = { history, stats, chart };
  }

  return result;
}
