import { NextRequest, NextResponse } from "next/server";
import { fetchOrder, upsertPendingSalesFromOrder } from "@/lib/mercadolivre";

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

// Healthcheck simples — só pra confirmar de fora que o endpoint está no ar e
// é alcançável publicamente (não faz nada com dados do Mercado Livre).
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "webhooks/mercadolivre" });
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
    console.error("[webhook ML] payload inválido (não é JSON)");
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  // Log de toda notificação recebida — mesmo as que a gente ignora — para
  // dar visibilidade de que o Mercado Livre está de fato chamando esse
  // endpoint (útil pra diagnosticar se o problema é entrega de webhook ou
  // processamento).
  console.log(
    `[webhook ML] recebida: topic=${notification.topic} resource=${notification.resource} attempts=${notification.attempts ?? "?"}`
  );

  if (notification.topic !== "orders_v2") {
    // Não é um tópico que a gente processa — apenas confirma o recebimento.
    return NextResponse.json({ ok: true });
  }

  const orderIdMatch = notification.resource.match(/\/orders\/(\d+)/);
  const orderId = orderIdMatch?.[1];
  if (!orderId) {
    console.error(`[webhook ML] resource sem ID de pedido reconhecível: ${notification.resource}`);
    return NextResponse.json({ ok: true });
  }

  try {
    const order = await fetchOrder(orderId);
    await upsertPendingSalesFromOrder(order);
    console.log(
      `[webhook ML] pedido ${orderId} processado com sucesso (${order.order_items.length} item(ns))`
    );
  } catch (err) {
    console.error(`[webhook ML] falha ao processar notificação do pedido ${orderId}:`, err);
    // Devolvemos erro de propósito: o Mercado Livre reenvia notificações que
    // falham (por até ~1h), e nosso upsert é idempotente — então é melhor
    // deixar ele tentar de novo mais tarde do que perder a venda em
    // silêncio por causa de uma falha passageira (token, rede, etc.).
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
