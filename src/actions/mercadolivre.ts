"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { pendingSales, products, sales } from "@/db/schema";
import { confirmPendingSaleSchema } from "@/lib/validations";
import { toNumber } from "@/lib/calculations";
import { getSettings } from "@/actions/settings";
import { getConnectionStatus } from "@/lib/mercadolivre";
import type { ActionResult } from "@/actions/products";

export { getConnectionStatus };

export async function listPendingSales() {
  const rows = await db
    .select()
    .from(pendingSales)
    .where(eq(pendingSales.status, "pendente"))
    .orderBy(pendingSales.orderDate);
  return rows;
}

function parseConfirmForm(formData: FormData) {
  return {
    productId: String(formData.get("productId") ?? ""),
    quantity: Number(formData.get("quantity") ?? 1),
    saleDate: String(formData.get("saleDate") ?? ""),
    dispatchedBy: String(formData.get("dispatchedBy") ?? ""),
  };
}

/**
 * Confirma uma venda pendente: cria a venda de verdade (reaproveitando os
 * dados financeiros cadastrados do produto interno escolhido, igual a uma
 * venda manual) e marca a pendência como resolvida. Os valores do Mercado
 * Livre (título, preço do anúncio etc.) são só para exibição na revisão —
 * quem manda no cálculo financeiro é sempre o cadastro do produto.
 */
export async function confirmPendingSale(
  pendingSaleId: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const raw = parseConfirmForm(formData);
  const parsed = confirmPendingSaleSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[issue.path.join(".") || "form"] = issue.message;
    }
    return { ok: false, errors };
  }

  const [pending] = await db
    .select()
    .from(pendingSales)
    .where(and(eq(pendingSales.id, pendingSaleId), eq(pendingSales.status, "pendente")))
    .limit(1);

  if (!pending) {
    return { ok: false, errors: { form: "Essa venda pendente não existe mais ou já foi processada." } };
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

  const [createdSale] = await db
    .insert(sales)
    .values({
      productId: product.id,
      productNameSnapshot: product.name,
      quantity: values.quantity,
      saleDate: values.saleDate,
      // Confirmar uma venda vinda do Mercado Livre pressupõe que ela já
      // existe e, na prática, já foi despachada — diferente do cadastro
      // manual, onde a venda normalmente ainda está para ser despachada.
      orderStatus: "despachado",
      dispatchedBy: values.dispatchedBy,
      operationalFeePercentSnapshot: partnerSettings.operationalFeePercent.toString(),
      reservePercentSnapshot: partnerSettings.reservePercent.toString(),
      donationPercentSnapshot: partnerSettings.donationPercent.toString(),
      notes: `Importado do Mercado Livre — pedido ${pending.mlOrderId}.`,
      unitPriceSnapshot: toNumber(product.unitPrice).toString(),
      kitQuantitySnapshot: product.kitQuantity,
      saleFeeTypeSnapshot: product.saleFeeType,
      saleFeeValueSnapshot: toNumber(product.saleFeeValue).toString(),
      freeShippingSnapshot: product.freeShipping,
      shippingCostSnapshot: toNumber(product.shippingCost).toString(),
      packagingCostSnapshot: toNumber(product.packagingCost).toString(),
      productCostSnapshot: toNumber(product.productCost).toString(),
    })
    .returning({ id: sales.id });

  await db
    .update(pendingSales)
    .set({
      status: "confirmada",
      matchedProductId: product.id,
      dispatchedBy: values.dispatchedBy,
      resultingSaleId: createdSale.id,
      updatedAt: new Date(),
    })
    .where(eq(pendingSales.id, pendingSaleId));

  revalidatePath("/pendentes");
  revalidatePath("/vendas");
  revalidatePath("/");
  return { ok: true };
}

export async function ignorePendingSale(pendingSaleId: string) {
  await db
    .update(pendingSales)
    .set({ status: "ignorada", updatedAt: new Date() })
    .where(eq(pendingSales.id, pendingSaleId));
  revalidatePath("/pendentes");
}
