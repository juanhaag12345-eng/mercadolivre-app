"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { products, sales, type OrderStatus } from "@/db/schema";
import { saleSchema } from "@/lib/validations";
import { toNumber } from "@/lib/calculations";
import { withFinancials } from "@/lib/sale-financials";
import { getSettings } from "@/actions/settings";
import type { ActionResult } from "@/actions/products";

export interface SalesFilter {
  productId?: string;
  from?: string;
  to?: string;
  status?: OrderStatus;
}

// Junta o código interno atual do produto (quando ele ainda existe) a cada
// venda — não é um snapshot, é só pra exibir "#N" junto do nome em telas de
// histórico, ajudando a diferenciar produtos com nomes parecidos.
function withProductCode(row: { sale: typeof sales.$inferSelect; productInternalCode: number | null }) {
  return { ...withFinancials(row.sale), productInternalCode: row.productInternalCode };
}

export type SaleListRow = ReturnType<typeof withProductCode>;

export async function listSales(filter: SalesFilter = {}) {
  const conditions = [];
  if (filter.productId) conditions.push(eq(sales.productId, filter.productId));
  if (filter.from) conditions.push(gte(sales.saleDate, filter.from));
  if (filter.to) conditions.push(lte(sales.saleDate, filter.to));
  if (filter.status) conditions.push(eq(sales.orderStatus, filter.status));

  const rows = await db
    .select({ sale: sales, productInternalCode: products.internalCode })
    .from(sales)
    .leftJoin(products, eq(sales.productId, products.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(sales.saleDate), desc(sales.createdAt));

  return rows.map(withProductCode);
}

export async function listRecentSales(limit = 8) {
  const rows = await db
    .select({ sale: sales, productInternalCode: products.internalCode })
    .from(sales)
    .leftJoin(products, eq(sales.productId, products.id))
    .orderBy(desc(sales.saleDate), desc(sales.createdAt))
    .limit(limit);
  return rows.map(withProductCode);
}

function parseSaleForm(formData: FormData) {
  return {
    productId: String(formData.get("productId") ?? ""),
    quantity: Number(formData.get("quantity") ?? 1),
    saleDate: String(formData.get("saleDate") ?? ""),
    orderStatus: String(formData.get("orderStatus") ?? "pendente"),
    dispatchedBy: String(formData.get("dispatchedBy") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    unitPriceOverride: emptyToUndefined(formData.get("unitPriceOverride")),
    shippingCostOverride: emptyToUndefined(formData.get("shippingCostOverride")),
    packagingCostOverride: emptyToUndefined(formData.get("packagingCostOverride")),
    productCostOverride: emptyToUndefined(formData.get("productCostOverride")),
  };
}

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null || value === "") return undefined;
  return Number(value);
}

export async function createSale(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const raw = parseSaleForm(formData);
  const parsed = saleSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[issue.path.join(".") || "form"] = issue.message;
    }
    return { ok: false, errors };
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, parsed.data.productId))
    .limit(1);

  if (!product) {
    return { ok: false, errors: { productId: "Produto não encontrado" } };
  }

  const values = parsed.data;
  const partnerSettings = await getSettings();

  await db.insert(sales).values({
    productId: product.id,
    productNameSnapshot: product.name,
    quantity: values.quantity,
    saleDate: values.saleDate,
    orderStatus: values.orderStatus,
    dispatchedBy: values.dispatchedBy,
    operationalFeePercentSnapshot: partnerSettings.operationalFeePercent.toString(),
    reservePercentSnapshot: partnerSettings.reservePercent.toString(),
    notes: values.notes || null,
    unitPriceSnapshot: (values.unitPriceOverride ?? toNumber(product.unitPrice)).toString(),
    kitQuantitySnapshot: product.kitQuantity,
    saleFeeTypeSnapshot: product.saleFeeType,
    saleFeeValueSnapshot: toNumber(product.saleFeeValue).toString(),
    freeShippingSnapshot: product.freeShipping,
    shippingCostSnapshot: (values.shippingCostOverride ?? toNumber(product.shippingCost)).toString(),
    packagingCostSnapshot: (values.packagingCostOverride ?? toNumber(product.packagingCost)).toString(),
    productCostSnapshot: (values.productCostOverride ?? toNumber(product.productCost)).toString(),
  });

  revalidatePath("/vendas");
  revalidatePath("/");
  redirect(`/vendas?registrado=${encodeURIComponent(product.name)}`);
}

export async function updateSaleStatus(id: string, status: OrderStatus) {
  await db.update(sales).set({ orderStatus: status, updatedAt: new Date() }).where(eq(sales.id, id));
  revalidatePath("/vendas");
  revalidatePath("/");
}

export async function deleteSale(id: string) {
  await db.delete(sales).where(eq(sales.id, id));
  revalidatePath("/vendas");
  revalidatePath("/");
}

export async function getSale(id: string) {
  const rows = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
  return rows[0] ? withFinancials(rows[0]) : null;
}

// ---- Agregações para o dashboard ----

export async function getSalesForRange(from?: string, to?: string, productId?: string) {
  const conditions = [];
  if (from) conditions.push(gte(sales.saleDate, from));
  if (to) conditions.push(lte(sales.saleDate, to));
  if (productId) conditions.push(eq(sales.productId, productId));

  const rows = await db
    .select({ sale: sales, productInternalCode: products.internalCode })
    .from(sales)
    .leftJoin(products, eq(sales.productId, products.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(sales.saleDate));
  return rows.map(withProductCode);
}

export async function getProductNamesForFilter() {
  const rows = await db
    .selectDistinct({ id: sales.productId, name: sales.productNameSnapshot })
    .from(sales)
    .orderBy(asc(sales.productNameSnapshot));
  return rows.filter((r) => r.id !== null) as { id: string; name: string }[];
}
