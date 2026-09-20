// Saldo estimado da carteira Mercado Pago de cada conta conectada.
//
// Não existe, na API do Mercado Livre/Mercado Pago, um endpoint que devolva
// "o saldo agora" como um número pronto — confirmado testando de verdade
// contra as duas contas conectadas (RADAR OFERTAS e VAREJO EM MOVIMENTO) em
// 20/09/2026. O que existe é o "relatório de liquidação" (settlement
// report): você pede um relatório cobrindo um período, ele é gerado de
// forma assíncrona (na prática, minutos) e só depois dá pra baixar um CSV
// com todas as movimentações daquele período — pagamentos liquidados,
// devoluções, contestações e SAQUES (retiradas da carteira, que não
// aparecem em nenhum outro lugar do nosso sistema).
//
// Por isso o saldo é sempre uma ESTIMATIVA "a partir da última
// sincronização" (ver mercadopagoBalances no schema): o usuário informa o
// saldo real de hoje (olhando o próprio app do Mercado Pago) como ponto de
// partida, e daí em diante:
//   - toda venda que passar a "released" (sales.moneyReleaseStatus, já
//     consultado por atualizarLiberacoes) soma o netAmount dela — isso já
//     temos com precisão, não precisa do relatório da Mercado Pago;
//   - o relatório de liquidação entra só para capturar o que a gente NÃO
//     tem em `sales`: saques (TRANSACTION_TYPE "PAYOUTS") e qualquer
//     estorno/ajuste/contestação não amarrado a um pedido conhecido.
// Linhas de liquidação (SETTLEMENT/SETTLEMENT_SHIPPING) COM order_id são
// ignoradas de propósito aqui, porque já as contamos pelo lado de `sales` —
// somar os dois lados seria contar a mesma venda duas vezes. Confirmado em
// teste real que essas linhas aparecem no relatório MESMO quando o dinheiro
// ainda não foi liberado (money_release_status ainda "pending"), então
// somar tudo do relatório sem essa distinção geraria um saldo estimado
// maior do que o real.

const MP_API_BASE = "https://api.mercadopago.com";

// Colunas pedidas no relatório — todas confirmadas como chaves válidas em
// teste real (a API não documenta o enum completo, então isso foi
// descoberto tentando). Qualquer chave inválida faz a Mercado Pago recusar
// a configuração inteira com 400, então esse conjunto foi mantido mínimo e
// testado (não mexer sem testar de novo antes).
const REPORT_COLUMNS = [
  "SOURCE_ID",
  "EXTERNAL_REFERENCE",
  "USER_ID",
  "SETTLEMENT_NET_AMOUNT",
  "TRANSACTION_TYPE",
  "TRANSACTION_AMOUNT",
  "MP_FEE_AMOUNT",
  "MONEY_RELEASE_DATE",
  "ORDER_ID",
  "REAL_AMOUNT",
  "INSTALLMENTS",
] as const;

async function mpFetch(path: string, accessToken: string, init?: RequestInit) {
  return fetch(`${MP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

/**
 * Garante que a conta tem uma configuração de relatório de liquidação
 * cadastrada na Mercado Pago, com as colunas que sabemos ler e
 * `include_withdraw` ligado (sem isso os saques não aparecem no relatório).
 * Idempotente — chamar de novo só reafirma a mesma configuração.
 */
export async function ensureSettlementReportConfig(accessToken: string): Promise<void> {
  const response = await mpFetch("/v1/account/settlement_report/config", accessToken, {
    method: "PUT",
    body: JSON.stringify({
      file_name_prefix: "mlvendas",
      columns: REPORT_COLUMNS.map((key) => ({ key })),
      frequency: { type: "monthly", value: 1, hour: 4 },
      include_withdraw: true,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao configurar relatório de liquidação (${response.status}): ${text}`);
  }
}

interface SettlementReportRequest {
  id: number;
  status: string;
}

/** Pede a geração de um novo relatório de liquidação para o período (datas ISO AAAA-MM-DD). */
export async function requestSettlementReport(
  accessToken: string,
  beginDateISO: string,
  endDateISO: string
): Promise<SettlementReportRequest> {
  const response = await mpFetch("/v1/account/settlement_report", accessToken, {
    method: "POST",
    body: JSON.stringify({
      begin_date: `${beginDateISO}T00:00:00Z`,
      end_date: `${endDateISO}T23:59:59Z`,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao pedir relatório de liquidação (${response.status}): ${text}`);
  }
  return (await response.json()) as SettlementReportRequest;
}

interface SettlementReportListItem {
  id: number;
  status: "pending" | "processed" | "failed" | string;
  file_name: string;
}

/**
 * Consulta o status de um relatório pedido anteriormente. Devolve `null` se
 * esse id ainda não aparece na lista (não deveria acontecer, mas a API é
 * assíncrona o suficiente pra valer a pena tratar).
 */
export async function checkSettlementReportStatus(
  accessToken: string,
  reportId: number
): Promise<SettlementReportListItem | null> {
  const response = await mpFetch("/v1/account/settlement_report/list", accessToken);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao consultar relatórios de liquidação (${response.status}): ${text}`);
  }
  const list = (await response.json()) as SettlementReportListItem[];
  return list.find((item) => item.id === reportId) ?? null;
}

export interface SettlementReportRow {
  externalReference: string;
  sourceId: string;
  userId: string;
  transactionType: string;
  transactionAmount: number;
  settlementNetAmount: number;
  realAmount: number;
  orderId: string;
}

function parseAmount(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Baixa e faz o parse (CSV separado por `;`, com cabeçalho) de um relatório já pronto. */
export async function downloadSettlementReport(
  accessToken: string,
  fileName: string
): Promise<SettlementReportRow[]> {
  const response = await mpFetch(`/v1/account/settlement_report/${fileName}`, accessToken);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao baixar relatório de liquidação (${response.status}): ${text}`);
  }
  const text = await response.text();
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const header = lines[0].split(";").map((h) => h.trim());
  const idx = (key: string) => header.indexOf(key);
  const iExternalRef = idx("EXTERNAL_REFERENCE");
  const iSourceId = idx("SOURCE_ID");
  const iUserId = idx("USER_ID");
  const iType = idx("TRANSACTION_TYPE");
  const iTxAmount = idx("TRANSACTION_AMOUNT");
  const iSettlementNet = idx("SETTLEMENT_NET_AMOUNT");
  const iRealAmount = idx("REAL_AMOUNT");
  const iOrderId = idx("ORDER_ID");

  // Parser simples de CSV com `;` — os valores desse relatório vêm sem `;`
  // dentro de campos entre aspas na prática, mas removemos as aspas mesmo
  // assim por segurança.
  const stripQuotes = (v: string | undefined) => (v ?? "").trim().replace(/^"|"$/g, "");

  return lines.slice(1).map((line) => {
    const cols = line.split(";");
    return {
      externalReference: stripQuotes(cols[iExternalRef]),
      sourceId: stripQuotes(cols[iSourceId]),
      userId: stripQuotes(cols[iUserId]),
      transactionType: stripQuotes(cols[iType]),
      transactionAmount: parseAmount(cols[iTxAmount] ?? "0"),
      settlementNetAmount: parseAmount(cols[iSettlementNet] ?? "0"),
      realAmount: parseAmount(cols[iRealAmount] ?? "0"),
      orderId: stripQuotes(cols[iOrderId]),
    };
  });
}

export interface MovementsSummary {
  withdrawalsTotal: number;
  otherAdjustmentsTotal: number;
  withdrawalsCount: number;
  otherAdjustmentsCount: number;
}

/**
 * Separa as linhas do relatório em "saques" (retirada da carteira) e
 * "outros ajustes" (estorno, contestação, taxa de antecipação, ou uma
 * liquidação sem pedido conhecido) — de propósito NÃO soma linhas de
 * SETTLEMENT/SETTLEMENT_SHIPPING que têm order_id, porque essas já entram
 * no saldo pelo lado de `sales.moneyReleaseStatus` (ver comentário no topo
 * do arquivo).
 */
export function summarizeMovements(rows: SettlementReportRow[]): MovementsSummary {
  let withdrawalsTotal = 0;
  let withdrawalsCount = 0;
  let otherAdjustmentsTotal = 0;
  let otherAdjustmentsCount = 0;

  for (const row of rows) {
    const isSettlementWithOrder =
      (row.transactionType === "SETTLEMENT" || row.transactionType === "SETTLEMENT_SHIPPING") &&
      row.orderId.length > 0;
    if (isSettlementWithOrder) continue;

    if (row.transactionType === "PAYOUTS") {
      withdrawalsTotal += row.realAmount;
      withdrawalsCount += 1;
    } else {
      otherAdjustmentsTotal += row.realAmount;
      otherAdjustmentsCount += 1;
    }
  }

  return { withdrawalsTotal, otherAdjustmentsTotal, withdrawalsCount, otherAdjustmentsCount };
}

export function formatMovementsSummary(summary: MovementsSummary, syncedAtISO: string): string {
  const { withdrawalsTotal, otherAdjustmentsTotal, withdrawalsCount, otherAdjustmentsCount } = summary;
  const parts: string[] = [];
  parts.push(
    withdrawalsCount > 0
      ? `${withdrawalsCount} saque(s) (R$ ${withdrawalsTotal.toFixed(2).replace(".", ",")})`
      : "sem saques"
  );
  parts.push(
    otherAdjustmentsCount > 0
      ? `${otherAdjustmentsCount} ajuste(s)/estorno(s) (R$ ${otherAdjustmentsTotal.toFixed(2).replace(".", ",")})`
      : "sem ajustes"
  );
  return `${parts.join(" · ")} — sincronizado ${syncedAtISO}`;
}
