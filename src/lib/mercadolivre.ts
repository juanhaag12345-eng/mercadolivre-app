import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mercadolivreCredentials } from "@/db/schema";

const ML_API_BASE = "https://api.mercadolibre.com";
const ML_AUTH_BASE = "https://auth.mercadolivre.com.br";

// URL de callback cadastrada no aplicativo do Mercado Livre — precisa bater
// exatamente com o que está configurado em "Minhas aplicações", senão a
// troca do código de autorização por token falha.
export const ML_REDIRECT_URI =
  process.env.MERCADOLIVRE_REDIRECT_URI ??
  "https://web2-production-22bd.up.railway.app/api/mercadolivre/callback";

// Origem pública do site, usada para montar redirects absolutos com
// segurança. Não usamos o host da requisição recebida (request.url) porque,
// atrás do proxy do Railway, ele pode chegar como "localhost:8080" em vez do
// domínio público — o que faria o navegador do usuário tentar abrir
// localhost depois do login do Mercado Livre.
export const SITE_ORIGIN = new URL(ML_REDIRECT_URI).origin;

function getClientCredentials() {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "MERCADOLIVRE_CLIENT_ID / MERCADOLIVRE_CLIENT_SECRET não configurados."
    );
  }
  return { clientId, clientSecret };
}

/**
 * Monta a URL de autorização (tela de login/consentimento do Mercado Livre)
 * para a qual o usuário precisa ser redirecionado para conectar a conta.
 */
export function buildAuthorizationUrl(state: string): string {
  const { clientId } = getClientCredentials();
  const url = new URL(`${ML_AUTH_BASE}/authorization`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", ML_REDIRECT_URI);
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token?: string;
}

async function storeTokenResponse(token: TokenResponse) {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  await db
    .insert(mercadolivreCredentials)
    .values({
      id: "default",
      mlUserId: String(token.user_id),
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? "",
      expiresAt,
      scope: token.scope,
    })
    .onConflictDoUpdate({
      target: mercadolivreCredentials.id,
      set: {
        mlUserId: String(token.user_id),
        accessToken: token.access_token,
        // O refresh_token é rotativo — o Mercado Livre nem sempre devolve um
        // novo (ex: fluxos futuros podem omitir), então só sobrescrevemos
        // quando um novo valor realmente veio na resposta.
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
        expiresAt,
        scope: token.scope,
        updatedAt: new Date(),
      },
    });
}

/**
 * Troca o código de autorização (recebido no callback OAuth) pelos tokens de
 * acesso, e já salva no banco.
 */
export async function exchangeAuthorizationCode(code: string): Promise<void> {
  const { clientId, clientSecret } = getClientCredentials();

  const response = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: ML_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao trocar código por token (${response.status}): ${text}`);
  }

  const token = (await response.json()) as TokenResponse;
  await storeTokenResponse(token);
}

async function refreshAccessToken(refreshToken: string): Promise<void> {
  const { clientId, clientSecret } = getClientCredentials();

  const response = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao renovar token (${response.status}): ${text}`);
  }

  const token = (await response.json()) as TokenResponse;
  await storeTokenResponse(token);
}

export interface MlConnectionStatus {
  connected: boolean;
  mlUserId?: string;
  expiresAt?: Date;
}

export async function getConnectionStatus(): Promise<MlConnectionStatus> {
  const rows = await db
    .select()
    .from(mercadolivreCredentials)
    .where(eq(mercadolivreCredentials.id, "default"))
    .limit(1);
  const row = rows[0];
  if (!row) return { connected: false };
  return { connected: true, mlUserId: row.mlUserId, expiresAt: row.expiresAt };
}

// Margem de segurança antes do vencimento real do access_token, para nunca
// tentar usar um token que expira nos próximos segundos da requisição.
const EXPIRY_BUFFER_MS = 2 * 60 * 1000;

/**
 * Retorna um access_token válido para chamar a API do Mercado Livre,
 * renovando automaticamente via refresh_token quando necessário. Lança um
 * erro claro se a conta ainda não foi conectada.
 */
export async function getValidAccessToken(): Promise<string> {
  const rows = await db
    .select()
    .from(mercadolivreCredentials)
    .where(eq(mercadolivreCredentials.id, "default"))
    .limit(1);
  const row = rows[0];

  if (!row) {
    throw new Error(
      "Conta do Mercado Livre ainda não conectada. Conecte em /pendentes."
    );
  }

  const expiresAtMs = row.expiresAt.getTime();
  if (expiresAtMs - EXPIRY_BUFFER_MS > Date.now()) {
    return row.accessToken;
  }

  await refreshAccessToken(row.refreshToken);

  const refreshed = await db
    .select()
    .from(mercadolivreCredentials)
    .where(eq(mercadolivreCredentials.id, "default"))
    .limit(1);
  if (!refreshed[0]) {
    throw new Error("Falha ao renovar token do Mercado Livre.");
  }
  return refreshed[0].accessToken;
}

// --- Tipos mínimos da resposta de /orders/$ID que a gente de fato usa ---

export interface MlOrderItem {
  item: {
    id: string;
    title: string;
  };
  quantity: number;
  unit_price: number;
}

export interface MlOrder {
  id: number;
  date_created: string;
  status: string;
  order_items: MlOrderItem[];
  buyer?: {
    nickname?: string;
  };
}

export async function fetchOrder(orderId: string | number): Promise<MlOrder> {
  const accessToken = await getValidAccessToken();
  const response = await fetch(`${ML_API_BASE}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao buscar pedido ${orderId} (${response.status}): ${text}`);
  }
  return (await response.json()) as MlOrder;
}
