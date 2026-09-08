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
// Com ?shipmentId=...&address=1, busca GET /shipments/$id?views=destination
// com o header X-Api-Version: 2 — serve pra checar se o nome real do
// comprador (receiver_name, quem recebe a encomenda) vem preenchido, já
// que a API de orders só devolve o id do buyer (nickname/nome completo não
// são expostos ali por privacidade).
//
// Não expõe nenhum segredo (o access_token nunca sai daqui).
export async function GET(request: NextRequest) {
  try {
    const accessToken = await getValidAccessToken();
    const orderId = request.nextUrl.searchParams.get("orderId");
    const shipmentId = request.nextUrl.searchParams.get("shipmentId");
    const wantAddress = request.nextUrl.searchParams.get("address") === "1";

    const url = orderId
      ? `https://api.mercadolibre.com/orders/${orderId}`
      : shipmentId
        ? wantAddress
          ? `https://api.mercadolibre.com/shipments/${shipmentId}?views=destination`
          : `https://api.mercadolibre.com/shipments/${shipmentId}/costs`
        : `https://api.mercadolibre.com/missed_feeds?app_id=${ML_APP_ID}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(shipmentId ? { "x-format-new": "true" } : {}),
        ...(wantAddress ? { "X-Api-Version": "2" } : {}),
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
