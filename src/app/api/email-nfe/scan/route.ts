import { NextRequest, NextResponse } from "next/server";
import { scanAllAccountsForNfe } from "@/lib/gmail-nfe";

export const dynamic = "force-dynamic";

// Endpoint chamado periodicamente por uma tarefa agendada externa (não tem
// nenhum cron rodando dentro do próprio app) para varrer as caixas de
// e-mail conectadas em busca de NF-e novas. Protegido por um token simples
// via header ou query string — não é dado do usuário, então não precisa de
// login de verdade, só evitar que qualquer um na internet dispare a
// varredura à vontade.
export async function GET(request: NextRequest) {
  const expectedToken = process.env.GMAIL_NFE_SCAN_TOKEN;
  if (!expectedToken) {
    return NextResponse.json(
      { error: "GMAIL_NFE_SCAN_TOKEN não configurado no servidor." },
      { status: 500 }
    );
  }

  const providedToken =
    request.headers.get("x-scan-token") ?? request.nextUrl.searchParams.get("token");

  if (providedToken !== expectedToken) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  try {
    const summary = await scanAllAccountsForNfe();
    return NextResponse.json(summary);
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
