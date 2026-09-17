import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { buildAuthorizationUrl } from "@/lib/gmail-nfe";

export const dynamic = "force-dynamic";

// Ponto de partida do fluxo OAuth do Gmail: gera um "state" (proteção
// contra CSRF), guarda em cookie de curta duração e redireciona para a tela
// de consentimento do Google. Precisa ser aberto pela pessoa dona da conta
// de e-mail que vai ser conectada (Juan, Djow, etc) — não dá pra automatizar
// esse clique.
export async function GET() {
  const state = randomUUID();
  const authorizationUrl = buildAuthorizationUrl(state);

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("gmail_nfe_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });
  return response;
}
