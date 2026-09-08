import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/mercadolivre";

export const dynamic = "force-dynamic";

const ML_APP_ID = "8549699768586111";

// Endpoint de diagnóstico temporário. Sem parâmetros, consulta o histórico de
// notificações perdidas (missed_feeds) do Mercado Livre para essa aplicação
// — útil pra descobrir se uma venda que não apareceu em /pendentes é porque
// o Mercado Livre nunca chamou nosso webhook, ou porque chamou e algo deu
// errado no meio do caminho.
//
// Com ?orderId=..., busca o JSON bruto de GET /orders/$id direto na API do
// Mercado Livre (sem passar pelos nossos tipos MlOrder, que só guardam os
// campos que a gente já sabia usar) — serve pra investigar divergências
// entre o que a gente calcula e o que aparece na Central de Vendedores,
// olhando o payload completo (order_items[].sale_fee, pack_id, etc).
//
// Com ?shipmentId=..., busca o JSON bruto de GET /shipments/$id/costs.
//
// Não expõe nenhum segredo (o access_token nunca sai daqui).
export async function GET(request: NextRequest) {
  try {
    const accessToken = await getValidAccessToken();
    const orderId = request.nextUrl.searchParams.get("orderId");
    const shipmentId = request.nextUrl.searchParams.get("shipmentId");

    const url = orderId
      ? `https://api.mercadolibre.com/orders/${orderId}`
      : shipmentId
        ? `https://api.mercadolibre.com/shipments/${shipmentId}/costs`
        : `https://api.mercadolibre.com/missed_feeds?app_id=${ML_APP_ID}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(shipmentId ? { "x-format-new": "true" } : {}),
      },
    });
    const body = await response.json();
    return NextResponse.json({ status: response.status, url, body });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "erro desconhecido" },
      { status: 500 }
    );
  }
}
