import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { buildAuthorizationUrl } from "@/lib/mercadolivre";

export const dynamic = "force-dynamic";

// Ponto de partida do fluxo OAuth: gera um "state" (proteção contra CSRF),
// guarda em um cookie de curta duração e redireciona para a tela de
// autorização do Mercado Livre. O usuário precisa estar logado, no
// navegador, com a conta VENDEDORA (admin) que deve ser conectada — essa
// etapa não pode ser feita por automação, só pela pessoa mesmo.
export async function GET() {
  const state = randomUUID();
  const authorizationUrl = buildAuthorizationUrl(state);

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("ml_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });
  return response;
}
