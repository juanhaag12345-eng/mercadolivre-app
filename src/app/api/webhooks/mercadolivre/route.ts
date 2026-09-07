import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pendingSales } from "@/db/schema";
import { fetchOrder, type MlOrder } from "@/lib/mercadolivre";

export const dynamic = "force-dynamic";

interface MlNotification {
  resource: string;
  topic: string;
  user_id: number;
  application_id: number;
  attempts?: number;
  sent?: string;
  received?: string;
}

// Guarda/atualiza uma linha de "venda pendente" por item do pedido. Usamos
// onConflictDoUpdate só nos campos de exibição — nunca sobrescrevemos
// status/matchedProductId/dispatchedBy/resultingSaleId, para não perder uma
// confirmação já feita caso o Mercado Livre reenvie a mesma notificação.
async function upsertPendingSalesFromOrder(order: MlOrder) {
  for (const orderItem of order.order_items) {
    await db
      .insert(pendingSales)
      .values({
        mlOrderId: String(order.id),
        mlOrderItemId: orderItem.item.id,
        titleSnapshot: orderItem.item.title,
        quantity: orderItem.quantity,
        unitPriceSnapshot: orderItem.unit_price.toString(),
        orderDate: new Date(order.date_created),
        orderStatusMl: order.status,
        buyerNickname: order.buyer?.nickname ?? null,
        rawOrderPayload: order,
      })
      .onConflictDoUpdate({
        target: [pendingSales.mlOrderId, pendingSales.mlOrderItemId],
        set: {
          titleSnapshot: orderItem.item.title,
          quantity: orderItem.quantity,
          unitPriceSnapshot: orderItem.unit_price.toString(),
          orderDate: new Date(order.date_created),
          orderStatusMl: order.status,
          buyerNickname: order.buyer?.nickname ?? null,
          rawOrderPayload: order,
          updatedAt: new Date(),
        },
      });
  }
}

// Recebe as notificações (webhooks) do Mercado Livre. Precisamos responder
// rápido (o ML espera 200 dentro de ~500ms, senão reenvia e pode chegar a
// desativar o tópico depois de falhas repetidas) — então respondemos assim
// que possível e, se der erro no processamento, deixamos o próprio reenvio
// automático do Mercado Livre tentar de novo depois (o upsert acima é
// idempotente, então reprocessar a mesma notificação não causa duplicidade).
export async function POST(request: NextRequest) {
  let notification: MlNotification;
  try {
    notification = await request.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  if (notification.topic !== "orders_v2") {
    // Não é um tópico que a gente processa — apenas confirma o recebimento.
    return NextResponse.json({ ok: true });
  }

  const orderIdMatch = notification.resource.match(/\/orders\/(\d+)/);
  const orderId = orderIdMatch?.[1];
  if (!orderId) {
    return NextResponse.json({ ok: true });
  }

  try {
    const order = await fetchOrder(orderId);
    await upsertPendingSalesFromOrder(order);
  } catch (err) {
    console.error(`Falha ao processar notificação do pedido ${orderId}:`, err);
    // Devolvemos erro de propósito: o Mercado Livre reenvia notificações que
    // falham (por até ~1h), e nosso upsert é idempotente — então é melhor
    // deixar ele tentar de novo mais tarde do que perder a venda em
    // silêncio por causa de uma falha passageira (token, rede, etc.).
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
