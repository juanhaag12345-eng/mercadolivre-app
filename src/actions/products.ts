"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, ilike, ne } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { productSchema, type ProductFormValues } from "@/lib/validations";

export async function listProducts(search?: string) {
  const rows = await db
    .select()
    .from(products)
    .where(search ? ilike(products.name, `%${search}%`) : undefined)
    .orderBy(asc(products.name));
  return rows;
}

export async function searchActiveProducts(query: string) {
  const rows = await db
    .select()
    .from(products)
    .where(
      query
        ? and(eq(products.active, true), ilike(products.name, `%${query}%`))
        : eq(products.active, true)
    )
    .orderBy(asc(products.name))
    .limit(20);
  return rows;
}

export async function getProduct(id: string) {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0] ?? null;
}

export type ActionResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

function parseFormValues(formData: FormData): ProductFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    isKit: formData.get("isKit") === "on",
    kitQuantity: Number(formData.get("kitQuantity") ?? 1),
    unitPrice: Number(formData.get("unitPrice") ?? 0),
    saleFeeType: (formData.get("saleFeeType") as "percentual" | "fixo") ?? "percentual",
    saleFeeValue: Number(formData.get("saleFeeValue") ?? 0),
    freeShipping: formData.get("freeShipping") === "on",
    shippingCost: Number(formData.get("shippingCost") ?? 0),
    packagingCost: Number(formData.get("packagingCost") ?? 0),
    productCost: Number(formData.get("productCost") ?? 0),
    active: formData.get("active") !== "off",
  };
}

function toDbValues(values: ProductFormValues) {
  return {
    name: values.name,
    imageUrl: values.imageUrl || null,
    isKit: values.isKit,
    kitQuantity: values.isKit ? values.kitQuantity : 1,
    unitPrice: values.unitPrice.toString(),
    saleFeeType: values.saleFeeType,
    saleFeeValue: values.saleFeeValue.toString(),
    freeShipping: values.freeShipping,
    shippingCost: values.shippingCost.toString(),
    packagingCost: values.packagingCost.toString(),
    productCost: values.productCost.toString(),
    active: values.active,
    updatedAt: new Date(),
  };
}

export async function createProduct(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const raw = parseFormValues(formData);
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: flattenErrors(parsed.error) };
  }

  const [created] = await db
    .insert(products)
    .values(toDbValues(parsed.data))
    .returning({ id: products.id });

  revalidatePath("/produtos");
  revalidatePath("/vendas/nova");
  redirect(`/produtos?criado=${encodeURIComponent(parsed.data.name)}&id=${created.id}`);
}

export async function updateProduct(
  id: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const raw = parseFormValues(formData);
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: flattenErrors(parsed.error) };
  }

  await db.update(products).set(toDbValues(parsed.data)).where(eq(products.id, id));

  revalidatePath("/produtos");
  revalidatePath(`/produtos/${id}`);
  revalidatePath("/vendas/nova");
  redirect(`/produtos?atualizado=${encodeURIComponent(parsed.data.name)}`);
}

export async function deleteProduct(id: string) {
  await db.delete(products).where(eq(products.id, id));
  revalidatePath("/produtos");
  redirect("/produtos?excluido=1");
}

export async function duplicateProductNameExists(name: string, excludeId?: string) {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(
      excludeId
        ? and(ilike(products.name, name), ne(products.id, excludeId))
        : ilike(products.name, name)
    )
    .limit(1);
  return rows.length > 0;
}

function flattenErrors(error: import("zod").ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
