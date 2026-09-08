"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { pendingSales, sales } from "@/db/schema";
import { confirmPendingSaleSchema } from "@/lib/validations";
import { getSettings } from "@/actions/settings";
import {
  getConnectionStatus,
  getValidAccessToken,
  searchRecentOrders,
  upsertPendingSalesFromOrder,
  SYNC_MIN_DATE,
} from "@/lib/mercadolivre";
import type { ActionResult } from "@/actions/products";

export { getConnectionStatus };

/**
 * Busca manualmente os pedidos mais recentes do vendedor direto na API do
 * Mercado Livre e atualiza /pendentes — rede de segurança para o caso do
 * webhook não ter recebido (ou ainda não receber) a notificação de uma
 * venda nova. Idempotente: rodar de novo sobre os mesmos pedidos não
 * duplica nem desfaz confirmações já feitas. Ignora pedidos anteriores a
 * SYNC_MIN_DATE.
 */
export async function syncRecentOrders(): Promise<{ ok: boolean; message: string }> {
  const status = await getConnectionStatus();
  if (!status.connected || !status.mlUserId) {
    return { ok: false, message: "Conecte a conta do Mercado Livre antes de sincronizar." };
  }

  try {
    const allOrders = await searchRecentOrders(status.mlUserId, 20);
    const orders = allOrders.filter((order) => new Date(order.date_created) >= SYNC_MIN_DATE);
    // Busca o access_token uma única vez aqui e reaproveita em todos os
    // pedidos do lote, em vez de cada upsertPendingSalesFromOrder buscar o
    // seu (evita N idas ao banco só pra ler a mesma credencial).
    const accessToken = await getValidAccessToken();
    let itemCount = 0;
    for (const order of orders) {
      await upsertPendingSalesFromOrder(order, { accessToken, sellerId: status.mlUserId });
      itemCount += order.order_items.length;
    }

    revalidatePath("/pendentes");

    if (allOrders.length === 0) {
      return { ok: true, message: "Nenhum pedido encontrado na conta do Mercado Livre." };
    }
    if (orders.length === 0) {
      return {
        ok: true,
        message: `${allOrders.length} pedido(s) encontrado(s), mas todos anteriores a 01/09/2026 — nenhum trazido para os pendentes.`,
      };
    }
    return {
      ok: true,
      message: `${orders.length} pedido(s) verificado(s) (${itemCount} item(ns)). A lista abaixo já foi atualizada.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro ao sincronizar com o Mercado Livre.",
    };
  }
}

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
    quantity: Number(formData.get("quantity") ?? 1),
    saleDate: String(formData.get("saleDate") ?? ""),
    dispatchedBy: String(formData.get("dispatchedBy") ?? ""),
    productCostManual: String(formData.get("productCostManual") ?? "0"),
  };
}

/**
 * Confirma uma venda pendente: cria a venda de verdade usando os valores
 * REAIS que já vieram do Mercado Livre (título do anúncio, receita, tarifa
 * de venda total, frete cobrado do vendedor) — não existe mais um produto
 * cadastrado a escolher. A única informação que a pessoa precisa preencher
 * é o custo do produto dessa venda e quem despachou.
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

  const values = parsed.data;
  const partnerSettings = await getSettings();
  const productCostManual = values.productCostManual.toFixed(2);

  const [createdSale] = await db
    .insert(sales)
    .values({
      productId: null,
      source: "mercadolivre",
      productNameSnapshot: pending.titleSnapshot,
      mlOrderId: pending.mlOrderId,
      mlPackId: pending.mlPackId,
      buyerNickname: pending.buyerNickname,
      buyerFullName: pending.buyerFullName,
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
      // Colunas do "modelo de receita" antigo (produto cadastrado) não se
      // aplicam a uma venda do Mercado Livre — preenchidas com valores
      // neutros só para satisfazer as colunas NOT NULL; withFinancials()
      // ignora todas elas quando source = "mercadolivre" e usa os valores
      // reais abaixo em vez disso.
      unitPriceSnapshot: pending.unitPriceSnapshot,
      kitQuantitySnapshot: 1,
      saleFeeTypeSnapshot: "fixo",
      saleFeeValueSnapshot: "0",
      freeShippingSnapshot: false,
      shippingCostSnapshot: "0",
      packagingCostSnapshot: "0",
      productCostSnapshot: "0",
      mlSaleFeeTotalSnapshot: pending.mlSaleFeeSnapshot,
      mlShippingTotalSnapshot: pending.mlShippingCostSnapshot,
      productCostManualSnapshot: productCostManual,
    })
    .returning({ id: sales.id });

  await db
    .update(pendingSales)
    .set({
      status: "confirmada",
      dispatchedBy: values.dispatchedBy,
      productCostManual,
      resultingSaleId: createdSale.id,
      updatedAt: new Date(),
    })
    .where(eq(pendingSales.id, pendingSaleId));

  revalidatePath("/pendentes");
  revalidatePath("/vendas");
  revalidatePath("/");
  revalidatePath("/produtos");
  revalidatePath("/custo-fornecimento");
  return { ok: true };
}

export async function ignorePendingSale(pendingSaleId: string) {
  await db
    .update(pendingSales)
    .set({ status: "ignorada", updatedAt: new Date() })
    .where(eq(pendingSales.id, pendingSaleId));
  revalidatePath("/pendentes");
}
