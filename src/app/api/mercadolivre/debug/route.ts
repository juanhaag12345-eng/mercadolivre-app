import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/mercadolivre";

export const dynamic = "force-dynamic";

const ML_APP_ID = "8549699768586111";

// Endpoint de diagnóstico temporário: consulta o histórico de notificações
// perdidas (missed_feeds) do Mercado Livre para essa aplicação. Só mostra
// tentativas que falharam (não voltaram HTTP 200 em até 1h de retentativas)
// — útil pra descobrir se uma venda que não apareceu em /pendentes é porque
// o Mercado Livre nunca chamou nosso webhook, ou porque chamou e algo deu
// errado no meio do caminho. Não expõe nenhum segredo (token não sai daqui).
export async function GET() {
  try {
    const accessToken = await getValidAccessToken();
    const response = await fetch(
      `https://api.mercadolibre.com/missed_feeds?app_id=${ML_APP_ID}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const body = await response.json();
    return NextResponse.json({ status: response.status, body });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "erro desconhecido" },
      { status: 500 }
    );
  }
}
