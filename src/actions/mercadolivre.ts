"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { pendingSales, sales } from "@/db/schema";
import { confirmPendingSaleSchema } from "@/lib/validations";
import { getSettings } from "@/actions/settings";
import {
  listConnections,
  getValidAccessTokenForAccount,
  removeConnection,
  searchRecentOrders,
  upsertPendingSalesFromOrder,
  SYNC_MIN_DATE,
} from "@/lib/mercadolivre";
import type { ActionResult } from "@/actions/products";

export { listConnections };

/**
 * Busca manualmente os pedidos mais recentes de UMA conta específica direto
 * na API do Mercado Livre e atualiza /pendentes — rede de segurança para o
 * caso do webhook não ter recebido (ou ainda não receber) a notificação de
 * uma venda nova. Idempotente: rodar de novo sobre os mesmos pedidos não
 * duplica nem desfaz confirmações já feitas. Ignora pedidos anteriores a
 * SYNC_MIN_DATE. `accountId` é o id da linha em mercadolivre_credentials
 * (cada conta conectada tem seu próprio botão "Buscar vendas recentes").
 */
export async function syncRecentOrders(accountId: string): Promise<{ ok: boolean; message: string }> {
  const connections = await listConnections();
  const connection = connections.find((c) => c.id === accountId);
  if (!connection) {
    return { ok: false, message: "Essa conta do Mercado Livre não está mais conectada." };
  }

  try {
    // Pagina automaticamente pedidos do mais novo pro mais antigo até passar
    // do corte de SYNC_MIN_DATE — antes essa busca trazia só uma página fixa
    // de 20 pedidos, e em dias de mais movimento isso já cobria só os 1-2
    // dias mais recentes, deixando pedidos mais antigos (ainda dentro do
    // período válido) de fora dos pendentes.
    const orders = await searchRecentOrders(connection.mlUserId, { sinceDate: SYNC_MIN_DATE });
    // Busca o access_token uma única vez aqui e reaproveita em todos os
    // pedidos do lote, em vez de cada upsertPendingSalesFromOrder buscar o
    // seu (evita N idas ao banco só pra ler a mesma credencial).
    const accessToken = await getValidAccessTokenForAccount(connection.mlUserId);
    let itemCount = 0;
    for (const order of orders) {
      await upsertPendingSalesFromOrder(order, { accessToken, sellerId: connection.mlUserId });
      itemCount += order.order_items.length;
    }

    revalidatePath("/pendentes");

    if (orders.length === 0) {
      return {
        ok: true,
        message: "Nenhum pedido a partir de 01/09/2026 encontrado na conta do Mercado Livre.",
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

/**
 * Desconecta uma conta do Mercado Livre (botão de excluir, em /pendentes).
 * As vendas já importadas/confirmadas continuam intactas — só a credencial
 * dessa conta é removida.
 */
export async function removeMlAccount(accountId: string): Promise<void> {
  await removeConnection(accountId);
  revalidatePath("/pendentes");
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
      mlSellerId: pending.mlSellerId,
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
