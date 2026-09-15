import { NextRequest, NextResponse } from "next/server";
import { getValidAccessTokenForAccount, listConnections } from "@/lib/mercadolivre";

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
// Com ?billingOrderIds=id1,id2,..., busca o JSON bruto de
// GET /billing/integration/group/ML/order/details (liberação de pagamento,
// usado em /liberacoes) — esse endpoint não é documentado publicamente,
// então esse parâmetro serve pra inspecionar o formato real da resposta.
// ATENÇÃO: confirmado que retorna 403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES
// com o token dessa aplicação — o app não tem permissão pra esse endpoint.
//
// Com ?paymentId=..., busca GET /v1/payments/$id (API de Pagamentos do
// Mercado Pago, que tem o campo money_release_date) usando o mesmo
// access_token do Mercado Livre. Com ?paymentId=...&paymentSource=ml, busca
// em vez disso GET /collections/v1/payments/$id (o mesmo recurso, mas
// espelhado no domínio do Mercado Livre) — testando as duas formas porque
// não é garantido que o token do Mercado Livre tenha permissão para chamar
// o domínio do Mercado Pago diretamente.
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
//
// Com duas (ou mais) contas conectadas, use ?mlUserId=... para escolher de
// qual conta consultar; sem esse parâmetro, usa a primeira conta conectada.
export async function GET(request: NextRequest) {
  try {
    const mlUserIdParam = request.nextUrl.searchParams.get("mlUserId");
    let mlUserId = mlUserIdParam;
    if (!mlUserId) {
      const connections = await listConnections();
      mlUserId = connections[0]?.mlUserId ?? null;
    }
    if (!mlUserId) {
      return NextResponse.json(
        { error: "Nenhuma conta do Mercado Livre conectada." },
        { status: 400 }
      );
    }
    const accessToken = await getValidAccessTokenForAccount(mlUserId);
    const orderId = request.nextUrl.searchParams.get("orderId");
    const billingOrderIds = request.nextUrl.searchParams.get("billingOrderIds");
    const paymentId = request.nextUrl.searchParams.get("paymentId");
    const paymentSource = request.nextUrl.searchParams.get("paymentSource");
    const shipmentId = request.nextUrl.searchParams.get("shipmentId");
    const wantAddress = request.nextUrl.searchParams.get("address") === "1";

    const url = orderId
      ? `https://api.mercadolibre.com/orders/${orderId}`
      : billingOrderIds
        ? `https://api.mercadolibre.com/billing/integration/group/ML/order/details?order_ids=${billingOrderIds}`
        : paymentId
          ? paymentSource === "ml"
            ? `https://api.mercadolibre.com/collections/v1/payments/${paymentId}`
            : `https://api.mercadopago.com/v1/payments/${paymentId}`
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
