import { NextRequest, NextResponse } from "next/server";
import { connectEmailAccountFromCode, SITE_ORIGIN } from "@/lib/gmail-nfe";

export const dynamic = "force-dynamic";

// Callback do fluxo OAuth do Gmail. Recebe o código de autorização, valida
// o "state" (protege contra CSRF) e troca o código pelos tokens, já
// descobrindo e salvando o e-mail da conta conectada.
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const expectedState = request.cookies.get("gmail_nfe_oauth_state")?.value;

  const redirectTo = (path: string) => {
    const response = NextResponse.redirect(new URL(path, SITE_ORIGIN));
    response.cookies.delete("gmail_nfe_oauth_state");
    return response;
  };

  if (error) {
    return redirectTo(`/notas-fiscais?email_erro=${encodeURIComponent(error)}`);
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectTo("/notas-fiscais?email_erro=state_invalido");
  }

  try {
    const email = await connectEmailAccountFromCode(code);
    return redirectTo(`/notas-fiscais?email_conectado=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error("Falha ao conectar conta de e-mail para NF-e:", err);
    const mensagem = err instanceof Error ? err.message : "erro_desconhecido";
    return redirectTo(`/notas-fiscais?email_erro=${encodeURIComponent(mensagem)}`);
  }
}
