import { XMLParser } from "fast-xml-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  nfeEmailAccounts,
  nfePendentes,
  PAYMENT_METHODS,
  type NfeItemParsed,
  type PaymentMethod,
} from "@/db/schema";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

// Só leitura — o app nunca apaga, marca como lido/spam ou responde nada.
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// Mesma lógica do Mercado Livre: URL pública fixa, resolvida a partir da
// variável de ambiente, nunca do host da requisição (atrás do proxy do
// Railway request.url pode vir como "localhost:8080").
export const GMAIL_NFE_REDIRECT_URI =
  process.env.GMAIL_NFE_REDIRECT_URI ??
  "https://web2-production-22bd.up.railway.app/api/email-nfe/callback";

export const SITE_ORIGIN = new URL(GMAIL_NFE_REDIRECT_URI).origin;

function getClientCredentials() {
  const clientId = process.env.GMAIL_NFE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_NFE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GMAIL_NFE_CLIENT_ID / GMAIL_NFE_CLIENT_SECRET não configurados.");
  }
  return { clientId, clientSecret };
}

/**
 * Monta a URL de autorização do Google para a qual o usuário precisa ser
 * redirecionado para conectar mais uma caixa de e-mail. `prompt=consent` +
 * `access_type=offline` garantem que a gente sempre recebe um
 * refresh_token, mesmo se essa conta já tiver autorizado o app antes.
 */
export function buildAuthorizationUrl(state: string): string {
  const { clientId } = getClientCredentials();
  const url = new URL(GOOGLE_AUTH_BASE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", GMAIL_NFE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  refresh_token?: string;
}

/**
 * Troca o código de autorização (recebido no callback OAuth) pelos tokens,
 * descobre o e-mail da conta conectada e salva/atualiza a linha em
 * nfe_email_accounts.
 */
export async function connectEmailAccountFromCode(code: string): Promise<string> {
  const { clientId, clientSecret } = getClientCredentials();

  const response = await fetch(GOOGLE_TOKEN_URL, {
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
      redirect_uri: GMAIL_NFE_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao trocar código por token (${response.status}): ${text}`);
  }

  const token = (await response.json()) as GoogleTokenResponse;
  if (!token.refresh_token) {
    // Acontece se a conta já tinha autorizado antes e o Google decidiu não
    // reemitir um refresh_token mesmo com prompt=consent — sem ele não dá
    // pra varrer a caixa sem pedir login de novo a cada poucos minutos.
    throw new Error(
      "O Google não retornou um refresh_token. Revogue o acesso anterior em " +
        "myaccount.google.com/permissions e tente conectar de novo."
    );
  }

  const email = await getProfileEmail(token.access_token);
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);

  await db
    .insert(nfeEmailAccounts)
    .values({
      email,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      scope: token.scope,
    })
    .onConflictDoUpdate({
      target: nfeEmailAccounts.email,
      set: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt,
        scope: token.scope,
        lastScanError: null,
        updatedAt: new Date(),
      },
    });

  return email;
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();

  const response = await fetch(GOOGLE_TOKEN_URL, {
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

  return (await response.json()) as GoogleTokenResponse;
}

async function getProfileEmail(accessToken: string): Promise<string> {
  const response = await fetch(`${GMAIL_API_BASE}/users/me/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Falha ao identificar a conta conectada (${response.status}).`);
  }
  const data = (await response.json()) as { emailAddress: string };
  return data.emailAddress;
}

/**
 * Garante um access_token válido para a conta (renovando se estiver perto
 * de expirar), já persistindo a renovação no banco.
 */
async function ensureValidAccessToken(
  account: typeof nfeEmailAccounts.$inferSelect
): Promise<string> {
  const expiresInMs = account.expiresAt.getTime() - Date.now();
  if (expiresInMs > 60_000) {
    return account.accessToken;
  }

  const token = await refreshAccessToken(account.refreshToken);
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  await db
    .update(nfeEmailAccounts)
    .set({
      accessToken: token.access_token,
      expiresAt,
      // O Google normalmente não reemite refresh_token nesse fluxo — só
      // sobrescreve se vier um novo.
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      updatedAt: new Date(),
    })
    .where(eq(nfeEmailAccounts.id, account.id));

  return token.access_token;
}

interface GmailMessagePart {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  payload?: GmailMessagePart;
}

function findXmlParts(part: GmailMessagePart | undefined, out: GmailMessagePart[] = []) {
  if (!part) return out;
  if (part.filename && part.filename.toLowerCase().endsWith(".xml") && part.body?.attachmentId) {
    out.push(part);
  }
  for (const child of part.parts ?? []) {
    findXmlParts(child, out);
  }
  return out;
}

async function fetchAttachmentBase64(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<string> {
  const response = await fetch(
    `${GMAIL_API_BASE}/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    throw new Error(`Falha ao baixar anexo (${response.status}).`);
  }
  const data = (await response.json()) as { data: string };
  // Gmail usa base64url (- e _ em vez de + e /).
  return data.data.replace(/-/g, "+").replace(/_/g, "/");
}

// Mapa aproximado do código <tPag> da NF-e (tabela oficial da SEFAZ) para a
// forma de pagamento do app — só uma sugestão pré-preenchida, o usuário
// confirma/troca na hora de aprovar.
const TPAG_TO_PAYMENT_METHOD: Record<string, PaymentMethod> = {
  "01": "dinheiro",
  "03": "cartao_credito",
  "04": "cartao_debito",
  "15": "boleto",
  "17": "pix",
  "18": "transferencia",
};

interface ParsedNfe {
  fornecedorCnpj: string | null;
  fornecedorNome: string;
  numeroNota: string | null;
  serieNota: string | null;
  dataEmissao: string | null;
  valorTotal: number;
  formaPagamentoSugerida: PaymentMethod | null;
  itens: NfeItemParsed[];
}

// parseTagValue:false é de propósito — a conversão automática do parser
// pra number derruba zeros à esquerda (ex: tPag "03" virava 3, o que
// quebrava o mapeamento de forma de pagamento). Os campos que a gente quer
// como número mesmo (qCom, vUnCom, vProd, vNF) já passam por toNumber() na
// leitura abaixo.
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Extrai os dados relevantes de uma NF-e (formato `nfeProc`/`NFe` padrão da
 * SEFAZ, versão 4.00) a partir do XML bruto. Não valida assinatura nem
 * autenticidade — isso já foi feito pela SEFAZ antes de a nota existir;
 * aqui só lemos os dados para virar uma pendência de conferência.
 */
export function parseNfeXml(xml: string): ParsedNfe {
  const parsed = xmlParser.parse(xml);
  // O XML pode vir como <nfeProc><NFe><infNFe>...</infNFe></NFe></nfeProc>
  // (o mais comum, anexado por e-mail) ou já como <NFe><infNFe>...</infNFe>
  // </NFe> solto — aceitamos os dois formatos.
  const nfe = parsed.nfeProc?.NFe ?? parsed.NFe;
  const infNFe = nfe?.infNFe;
  if (!infNFe) {
    throw new Error("XML não parece ser uma NF-e (elemento infNFe não encontrado).");
  }

  const ide = infNFe.ide ?? {};
  const emit = infNFe.emit ?? {};
  const total = infNFe.total?.ICMSTot ?? {};
  const dets = asArray(infNFe.det);

  const itens: NfeItemParsed[] = dets.map((det) => {
    const prod = det.prod ?? {};
    const quantidade = toNumber(prod.qCom);
    const valorUnitario = toNumber(prod.vUnCom);
    const valorTotal = prod.vProd !== undefined ? toNumber(prod.vProd) : quantidade * valorUnitario;
    return {
      codigoFornecedor: String(prod.cProd ?? ""),
      ean: prod.cEAN && prod.cEAN !== "SEM GTIN" ? String(prod.cEAN) : null,
      descricao: String(prod.xProd ?? "Item sem descrição"),
      quantidade,
      valorUnitario,
      valorTotal,
    };
  });

  // <pag> pode ter um ou mais <detPag> — usamos o primeiro só para sugerir
  // a forma de pagamento do formulário.
  const detPag = asArray(infNFe.pag?.detPag)[0];
  const tPag = detPag?.tPag !== undefined ? String(detPag.tPag) : undefined;

  // dhEmi vem como "2026-09-16T22:23:46-03:00" — pegamos só a parte da data.
  const dhEmi = typeof ide.dhEmi === "string" ? ide.dhEmi : null;

  return {
    fornecedorCnpj: emit.CNPJ ? String(emit.CNPJ) : null,
    fornecedorNome: String(emit.xNome ?? "Fornecedor não identificado"),
    numeroNota: ide.nNF !== undefined ? String(ide.nNF) : null,
    serieNota: ide.serie !== undefined ? String(ide.serie) : null,
    dataEmissao: dhEmi ? dhEmi.slice(0, 10) : null,
    valorTotal: toNumber(total.vNF),
    formaPagamentoSugerida: tPag ? TPAG_TO_PAYMENT_METHOD[tPag] ?? null : null,
    itens,
  };
}

export interface ScanSummary {
  contasVarridas: number;
  novasPendencias: number;
  erros: { email: string; mensagem: string }[];
}

/**
 * Varre todas as contas de e-mail conectadas em busca de NF-e novas
 * (mensagens com anexo .xml ainda não vistas) e cria uma pendência em
 * /notas-fiscais para cada uma. Nunca toca em estoque/compras — só isso,
 * que é feito manualmente na aprovação.
 */
export async function scanAllAccountsForNfe(): Promise<ScanSummary> {
  const accounts = await db.select().from(nfeEmailAccounts);
  const summary: ScanSummary = { contasVarridas: 0, novasPendencias: 0, erros: [] };

  for (const account of accounts) {
    try {
      const novas = await scanAccountForNfe(account);
      summary.contasVarridas += 1;
      summary.novasPendencias += novas;
      await db
        .update(nfeEmailAccounts)
        .set({ lastScannedAt: new Date(), lastScanError: null })
        .where(eq(nfeEmailAccounts.id, account.id));
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err);
      summary.erros.push({ email: account.email, mensagem });
      await db
        .update(nfeEmailAccounts)
        .set({ lastScanError: mensagem })
        .where(eq(nfeEmailAccounts.id, account.id));
    }
  }

  return summary;
}

async function scanAccountForNfe(
  account: typeof nfeEmailAccounts.$inferSelect
): Promise<number> {
  const accessToken = await ensureValidAccessToken(account);

  // Últimos 30 dias é uma folga generosa (varredura roda com frequência) —
  // o que evita reprocessar é sempre o gmailMessageId já salvo, não a
  // janela de tempo.
  const query = encodeURIComponent("has:attachment filename:xml newer_than:30d");
  const listResponse = await fetch(
    `${GMAIL_API_BASE}/users/me/messages?q=${query}&maxResults=25`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listResponse.ok) {
    throw new Error(`Falha ao listar mensagens (${listResponse.status}).`);
  }
  const list = (await listResponse.json()) as { messages?: { id: string }[] };
  const messageIds = (list.messages ?? []).map((m) => m.id);
  if (messageIds.length === 0) return 0;

  const existentes = await db
    .select({ gmailMessageId: nfePendentes.gmailMessageId })
    .from(nfePendentes)
    .where(eq(nfePendentes.emailAccountId, account.id));
  const jaVistos = new Set(existentes.map((e) => e.gmailMessageId));

  let novas = 0;
  for (const messageId of messageIds) {
    if (jaVistos.has(messageId)) continue;

    const messageResponse = await fetch(
      `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!messageResponse.ok) continue;
    const message = (await messageResponse.json()) as GmailMessage;

    const xmlParts = findXmlParts(message.payload);
    if (xmlParts.length === 0) continue;

    for (const part of xmlParts) {
      // Guardado fora do try pra ficar acessível no catch também — mesmo
      // quando o XML não é uma NF-e válida, a gente ainda quer guardar o
      // conteúdo original pra dar pra baixar/conferir manualmente na tela.
      let xml: string | null = null;
      try {
        const base64 = await fetchAttachmentBase64(
          accessToken,
          messageId,
          part.body!.attachmentId!
        );
        xml = Buffer.from(base64, "base64").toString("utf-8");
        const parsedNfe = parseNfeXml(xml);

        await db.insert(nfePendentes).values({
          emailAccountId: account.id,
          gmailMessageId: messageId,
          fornecedorCnpj: parsedNfe.fornecedorCnpj,
          fornecedorNome: parsedNfe.fornecedorNome,
          numeroNota: parsedNfe.numeroNota,
          serieNota: parsedNfe.serieNota,
          dataEmissao: parsedNfe.dataEmissao,
          valorTotal: String(parsedNfe.valorTotal),
          formaPagamentoSugerida: parsedNfe.formaPagamentoSugerida,
          itens: parsedNfe.itens,
          xmlConteudo: xml,
        });
        novas += 1;
        // Um e-mail pode trazer mais de uma NF-e anexada (raro, mas
        // acontece com XML + outro XML) — cada .xml vira uma pendência
        // própria; se isso repetir pro mesmo messageId, o unique de
        // gmailMessageId no schema bloquearia, então só a primeira conta.
        break;
      } catch (err) {
        // XML anexado que não é uma NF-e válida (ex: um boleto em XML,
        // ou nota malformada) — registra como pendência com erro em vez de
        // travar a varredura inteira ou perder o e-mail silenciosamente.
        const mensagem = err instanceof Error ? err.message : String(err);
        await db
          .insert(nfePendentes)
          .values({
            emailAccountId: account.id,
            gmailMessageId: messageId,
            fornecedorNome: "Não identificado",
            valorTotal: "0",
            itens: [],
            xmlConteudo: xml,
            erro: mensagem,
          })
          .onConflictDoNothing();
        novas += 1;
      }
    }
  }

  return novas;
}

export { PAYMENT_METHODS };
