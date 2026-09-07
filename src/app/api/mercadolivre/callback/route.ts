import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode, SITE_ORIGIN } from "@/lib/mercadolivre";

export const dynamic = "force-dynamic";

// Callback do fluxo OAuth Server-Side do Mercado Livre. Recebe o código de
// autorização, valida o "state" (protege contra CSRF) e troca o código
// pelos tokens de acesso, já salvando no banco.
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const expectedState = request.cookies.get("ml_oauth_state")?.value;

  const redirectTo = (path: string) => {
    // Monta a URL a partir de SITE_ORIGIN (domínio público conhecido), não de
    // request.url — atrás do proxy do Railway request.url pode vir com host
    // "localhost:8080", o que quebraria o redirect no navegador do usuário.
    const response = NextResponse.redirect(new URL(path, SITE_ORIGIN));
    response.cookies.delete("ml_oauth_state");
    return response;
  };

  if (error) {
    return redirectTo(`/pendentes?ml_erro=${encodeURIComponent(error)}`);
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectTo("/pendentes?ml_erro=state_invalido");
  }

  try {
    await exchangeAuthorizationCode(code);
  } catch (err) {
    console.error("Falha ao conectar conta do Mercado Livre:", err);
    return redirectTo("/pendentes?ml_erro=troca_token_falhou");
  }

  return redirectTo("/pendentes?ml_conectado=1");
}
