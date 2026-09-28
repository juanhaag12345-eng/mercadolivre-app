"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mercadopagoBalances, sales } from "@/db/schema";
import { withFinancials, type SaleWithFinancials } from "@/lib/sale-financials";
import { notReleasedCondition, runAtualizarLiberacoes } from "@/lib/liberacoes-sync";
import { toNumber, isGarantida } from "@/lib/calculations";
import { toSaoPauloDateISO } from "@/lib/dates";
import { todayISO } from "@/lib/format";
import { listPurchases } from "@/actions/stock";

export type LiberacaoRow = SaleWithFinancials & { netAmount: number };

/**
 * Valor líquido estimado que efetivamente cai na conta do vendedor: receita
 * menos a tarifa de venda do Mercado Livre menos o frete cobrado do
 * vendedor — os três já são valores REAIS (não estimativas) vindos do
 * Mercado Livre no momento da confirmação da venda. Não inclui o custo do
 * produto (isso não é descontado pelo marketplace, é custo interno).
 */
function withNetAmount(sale: ReturnType<typeof withFinancials>): LiberacaoRow {
  return { ...sale, netAmount: sale.revenue - sale.saleFeeAmount - sale.shippingTotal };
}

async function loadPendingReleaseSales(mlSellerId?: string): Promise<LiberacaoRow[]> {
  const condition = mlSellerId ? and(notReleasedCondition(), eq(sales.mlSellerId, mlSellerId)) : notReleasedCondition();
  const rows = await db.select().from(sales).where(condition).orderBy(sales.saleDate);
  return rows.map((row) => withNetAmount(withFinancials(row)));
}

/**
 * Lista cada venda do Mercado Livre ainda não liberada, para a aba
 * /liberacoes — uma por linha, com todo o detalhe (não é uma agregação).
 */
export async function listLiberacoes(mlSellerId?: string): Promise<LiberacaoRow[]> {
  return loadPendingReleaseSales(mlSellerId);
}

/**
 * Resumo para o card do dashboard: quantas vendas e quanto, no total, ainda
 * está pendente de cair na conta.
 */
export async function getPendingReleaseSummary(mlSellerId?: string): Promise<{ count: number; total: number }> {
  const rows = await loadPendingReleaseSales(mlSellerId);
  const total = rows.reduce((sum, r) => sum + r.netAmount, 0);
  return { count: rows.length, total };
}

/**
 * Consulta a data/status de liberação de todas as vendas ainda não marcadas
 * como liberadas e o status de envio de quem ainda não tem um status final
 * (ver runAtualizarLiberacoes, em lib/liberacoes-sync.ts, onde mora a lógica
 * de verdade) e atualiza o banco. Essa Server Action é só o que o botão
 * "Atualizar liberações" em /liberacoes chama — ela existe separada da
 * lógica porque só quem roda dentro de uma requisição pode chamar
 * revalidatePath. O mesmo trabalho também roda sozinho a cada poucas horas
 * (ver instrumentation.ts), então esse botão serve pra forçar uma checagem
 * na hora, não é mais a única forma de atualizar.
 */
export async function atualizarLiberacoes(): Promise<{ ok: boolean; message: string }> {
  const result = await runAtualizarLiberacoes();
  revalidatePath("/liberacoes");
  revalidatePath("/");
  return { ok: result.ok, message: result.message };
}

// --- Calendário de liberações (topo da tela /liberacoes) ---

export interface LiberacaoCalendarDay {
  date: string; // AAAA-MM-DD
  count: number;
  total: number;
  // Contas (mlSellerId) com liberação prevista nesse dia — usado pra marcar
  // no calendário de qual conta é o depósito (ex.: "R", "V" ou "RV"), sem
  // precisar abrir cada venda pra saber.
  mlSellerIds: string[];
  // Quantas dessas vendas (e quanto do total) já estão "garantidas" —
  // mercadoria confirmada como entregue pelo Mercado Envios (ver
  // isGarantida) — pra mostrar no calendário quanto daquele dia já não
  // corre risco de cancelamento/estorno.
  garantidoCount: number;
  garantidoTotal: number;
}

export interface LiberacaoCalendarData {
  days: LiberacaoCalendarDay[];
  semPrevisao: { count: number; total: number };
}

/**
 * Agrupa as vendas ainda pendentes de liberação pelo dia em que o dinheiro
 * deve cair (moneyReleaseDate, já no fuso de São Paulo) — para o calendário
 * no topo de /liberacoes. Vendas sem previsão ainda (nunca verificadas, ou
 * verificadas mas sem data devolvida pela Mercado Pago) entram à parte, em
 * `semPrevisao`, porque não têm como aparecer marcadas num dia do calendário.
 */
export async function getLiberacoesCalendar(mlSellerId?: string): Promise<LiberacaoCalendarData> {
  const rows = await loadPendingReleaseSales(mlSellerId);

  const byDate = new Map<
    string,
    { count: number; total: number; mlSellerIds: Set<string>; garantidoCount: number; garantidoTotal: number }
  >();
  let semPrevisaoCount = 0;
  let semPrevisaoTotal = 0;

  for (const row of rows) {
    if (!row.moneyReleaseDate) {
      semPrevisaoCount += 1;
      semPrevisaoTotal += row.netAmount;
      continue;
    }
    const dateKey = toSaoPauloDateISO(row.moneyReleaseDate);
    const entry =
      byDate.get(dateKey) ?? { count: 0, total: 0, mlSellerIds: new Set<string>(), garantidoCount: 0, garantidoTotal: 0 };
    entry.count += 1;
    entry.total += row.netAmount;
    if (row.mlSellerId) entry.mlSellerIds.add(row.mlSellerId);
    if (isGarantida(row.shippingStatus)) {
      entry.garantidoCount += 1;
      entry.garantidoTotal += row.netAmount;
    }
    byDate.set(dateKey, entry);
  }

  const days = Array.from(byDate.entries())
    .map(([date, v]) => ({
      date,
      count: v.count,
      total: v.total,
      mlSellerIds: Array.from(v.mlSellerIds),
      garantidoCount: v.garantidoCount,
      garantidoTotal: v.garantidoTotal,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { days, semPrevisao: { count: semPrevisaoCount, total: semPrevisaoTotal } };
}

// --- Fluxo de caixa: saldo liberado x compras a pagar (ver RiscoFluxoCaixaCard) ---

export interface FluxoCaixaEvento {
  date: string;
  tipo: "entrada" | "saida";
  descricao: string;
  valor: number;
  saldoProjetado: number;
}

export interface FluxoCaixaRisco {
  date: string;
  descricao: string;
  faltam: number; // quanto falta pra cobrir esse pagamento, no dia dele
}

export interface FluxoCaixaData {
  saldoAtualTotal: number;
  temSaldoConfigurado: boolean;
  eventos: FluxoCaixaEvento[];
  riscos: FluxoCaixaRisco[];
  proximaFaturaCartao: { date: string; total: number; saldoProjetadoNoDia: number; risco: boolean } | null;
}

/**
 * Projeta o saldo das duas contas Mercado Pago somado (o cartão não é pago
 * de uma conta específica, então o cálculo é sempre com o total) dia a dia,
 * a partir de hoje: soma as liberações de vendas ainda pendentes (pela
 * previsão de moneyReleaseDate) e subtrai as compras registradas em
 * /compras que ainda não foram pagas, na data de vencimento de cada uma.
 * Sinaliza como "risco" qualquer pagamento cujo vencimento chega antes de
 * haver saldo suficiente projetado pra cobri-lo — para ajudar a não atrasar
 * a fatura do cartão (vencimento fixo todo dia 10) nem nenhum outro
 * compromisso.
 */
export async function getFluxoCaixaRisco(): Promise<FluxoCaixaData> {
  const balances = await db.select().from(mercadopagoBalances);
  const temSaldoConfigurado = balances.length > 0;
  const saldoAtualTotal = balances.reduce((sum, b) => sum + toNumber(b.currentEstimate), 0);

  if (!temSaldoConfigurado) {
    return { saldoAtualTotal: 0, temSaldoConfigurado: false, eventos: [], riscos: [], proximaFaturaCartao: null };
  }

  const [pendingSalesRows, purchases] = await Promise.all([
    loadPendingReleaseSales(),
    listPurchases({ filtro: "pendente" }),
  ]);

  const entradas = pendingSalesRows
    .filter((s): s is typeof s & { moneyReleaseDate: Date } => Boolean(s.moneyReleaseDate))
    .map((s) => ({
      date: toSaoPauloDateISO(s.moneyReleaseDate),
      tipo: "entrada" as const,
      descricao: "Liberação de venda(s)",
      valor: s.netAmount,
    }));

  const saidas = purchases
    .filter((p) => p.dueDate)
    .map((p) => ({
      date: p.dueDate as string,
      tipo: "saida" as const,
      descricao: `${p.itemName} — ${p.supplier}`,
      valor: -p.totalCost,
    }));

  const todos = [...entradas, ...saidas].sort((a, b) => a.date.localeCompare(b.date));

  let saldoCorrente = saldoAtualTotal;
  const eventos: FluxoCaixaEvento[] = [];
  const riscos: FluxoCaixaRisco[] = [];

  for (const evento of todos) {
    saldoCorrente += evento.valor;
    eventos.push({ date: evento.date, tipo: evento.tipo, descricao: evento.descricao, valor: evento.valor, saldoProjetado: saldoCorrente });
    if (evento.tipo === "saida" && saldoCorrente < 0) {
      riscos.push({ date: evento.date, descricao: evento.descricao, faltam: Math.abs(saldoCorrente) });
    }
  }

  // Próxima fatura do cartão: dia 10 mais próximo (hoje ou no futuro),
  // somando só as compras feitas no cartão de crédito com vencimento até lá.
  const today = todayISO();
  const [y, m, d] = today.split("-").map(Number);
  const proximoDia10 = d <= 10 ? `${y}-${String(m).padStart(2, "0")}-10` : (() => {
    const next = new Date(Date.UTC(y, m, 10)); // mês já é 0-index+1 aqui, então "m" aponta pro próximo mês
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-10`;
  })();

  const compraCartaoAteFatura = purchases.filter(
    (p) => p.paymentMethod === "cartao_credito" && p.dueDate && p.dueDate <= proximoDia10
  );
  const totalFatura = compraCartaoAteFatura.reduce((sum, p) => sum + p.totalCost, 0);

  let proximaFaturaCartao: FluxoCaixaData["proximaFaturaCartao"] = null;
  if (totalFatura > 0) {
    // saldo projetado até a véspera da fatura (tudo que já entrou/sairia antes dela)
    const eventosAteVespera = eventos.filter((e) => e.date < proximoDia10);
    const saldoNoDia =
      eventosAteVespera.length > 0 ? eventosAteVespera[eventosAteVespera.length - 1].saldoProjetado : saldoAtualTotal;
    proximaFaturaCartao = {
      date: proximoDia10,
      total: totalFatura,
      saldoProjetadoNoDia: saldoNoDia,
      risco: saldoNoDia < totalFatura,
    };
  }

  return { saldoAtualTotal, temSaldoConfigurado, eventos, riscos, proximaFaturaCartao };
}
