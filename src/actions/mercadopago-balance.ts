"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  mercadolivreCredentials,
  mercadopagoBalances,
  mercadopagoManualTransactions,
  sales,
  type Dispatcher,
  type ManualTransactionType,
} from "@/db/schema";
import { getValidAccessTokenForAccount } from "@/lib/mercadolivre";
import { withFinancials } from "@/lib/sale-financials";
import { toNumber } from "@/lib/calculations";
import { addDays } from "@/lib/dates";
import { todayISO } from "@/lib/format";
import {
  ensureSettlementReportConfig,
  requestSettlementReport,
  checkSettlementReportStatus,
  downloadSettlementReport,
  summarizeMovements,
  formatMovementsSummary,
} from "@/lib/mercadopago-balance";

export interface AccountBalanceRow {
  mlUserId: string;
  nickname: string | null;
  hasBaseline: boolean;
  baselineAmount: number | null;
  baselineDate: string | null;
  currentEstimate: number | null;
  lastSyncedAt: Date | null;
  lastSyncSummary: string | null;
  syncPending: boolean;
}

/** Lista o saldo estimado de cada conta conectada, para a seção de saldo em /liberacoes. */
export async function listAccountBalances(): Promise<AccountBalanceRow[]> {
  const connections = await db.select().from(mercadolivreCredentials);
  const balances = await db.select().from(mercadopagoBalances);
  const byUser = new Map(balances.map((b) => [b.mlUserId, b]));

  return connections.map((conn) => {
    const b = byUser.get(conn.mlUserId);
    return {
      mlUserId: conn.mlUserId,
      nickname: conn.nickname,
      hasBaseline: Boolean(b),
      baselineAmount: b ? toNumber(b.baselineAmount) : null,
      baselineDate: b?.baselineDate ?? null,
      currentEstimate: b ? toNumber(b.currentEstimate) : null,
      lastSyncedAt: b?.lastSyncedAt ?? null,
      lastSyncSummary: b?.lastSyncSummary ?? null,
      syncPending: Boolean(b?.pendingReportId),
    };
  });
}

/**
 * Define (ou reinicia) o ponto de partida do saldo estimado de uma conta —
 * o usuário olha o saldo real no app do Mercado Pago e informa aqui. Serve
 * tanto para configurar pela primeira vez quanto para corrigir o saldo
 * depois, se ele foi se afastando do real com o tempo.
 */
export async function setBalanceBaseline(mlUserId: string, amount: number): Promise<void> {
  const today = todayISO();
  await db
    .insert(mercadopagoBalances)
    .values({
      mlUserId,
      baselineAmount: amount.toString(),
      baselineDate: today,
      currentEstimate: amount.toString(),
      lastSyncedThroughDate: today,
      lastSyncedAt: new Date(),
      lastSyncSummary: "Saldo definido manualmente.",
      pendingReportId: null,
      pendingReportPeriodStart: null,
      pendingReportPeriodEnd: null,
      pendingReportRequestedAt: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: mercadopagoBalances.mlUserId,
      set: {
        baselineAmount: amount.toString(),
        baselineDate: today,
        currentEstimate: amount.toString(),
        lastSyncedThroughDate: today,
        lastSyncedAt: new Date(),
        lastSyncSummary: "Saldo redefinido manualmente.",
        pendingReportId: null,
        pendingReportPeriodStart: null,
        pendingReportPeriodEnd: null,
        pendingReportRequestedAt: null,
        updatedAt: new Date(),
      },
    });
  revalidatePath("/liberacoes");
}

export interface ManualTransactionRow {
  id: string;
  mlUserId: string;
  tipo: ManualTransactionType;
  valor: number;
  descricao: string;
  responsavel: Dispatcher | null;
  observacao: string | null;
  createdAt: Date;
}

/**
 * Últimas movimentações manuais lançadas (compra usando o saldo, ou
 * depósito feito direto na conta) — pra mostrar o histórico em
 * /liberacoes, por conta. Ver mercadopagoManualTransactions no schema.
 */
export async function listManualTransactions(mlUserId?: string, limit = 10): Promise<ManualTransactionRow[]> {
  const condition = mlUserId ? eq(mercadopagoManualTransactions.mlUserId, mlUserId) : undefined;
  const rows = await db
    .select()
    .from(mercadopagoManualTransactions)
    .where(condition)
    .orderBy(desc(mercadopagoManualTransactions.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    mlUserId: r.mlUserId,
    tipo: r.tipo,
    valor: toNumber(r.valor),
    descricao: r.descricao,
    responsavel: r.responsavel,
    observacao: r.observacao,
    createdAt: r.createdAt,
  }));
}

export interface RegistrarTransacaoManualInput {
  mlUserId: string;
  tipo: ManualTransactionType;
  valor: number;
  descricao: string;
  responsavel?: Dispatcher | null;
  observacao?: string | null;
}

/**
 * Registra uma movimentação manual no saldo Mercado Pago — pra tudo que
 * mexe no saldo da conta MAS não passa pelo fluxo normal de vendas do
 * Mercado Livre e por isso a sincronização automática (ver
 * syncAccountBalance) nunca vai enxergar sozinha: um PIX feito direto na
 * conta (soma) ou uma compra paga usando o saldo do Mercado Pago (subtrai).
 * Aplica direto em cima do currentEstimate já calculado, sem mexer no
 * baseline nem no histórico de sincronização — é um ajuste independente.
 */
export async function registrarTransacaoManual(
  input: RegistrarTransacaoManualInput
): Promise<{ ok: boolean; message: string }> {
  if (!Number.isFinite(input.valor) || input.valor <= 0) {
    return { ok: false, message: "Informe um valor válido, maior que zero." };
  }
  if (!input.descricao.trim()) {
    return {
      ok: false,
      message: input.tipo === "compra" ? "Descreva qual compra foi realizada." : "Descreva o motivo do depósito.",
    };
  }

  const [balance] = await db
    .select()
    .from(mercadopagoBalances)
    .where(eq(mercadopagoBalances.mlUserId, input.mlUserId))
    .limit(1);
  if (!balance) {
    return { ok: false, message: "Defina o saldo inicial dessa conta antes de lançar uma transação manual." };
  }

  await db.insert(mercadopagoManualTransactions).values({
    mlUserId: input.mlUserId,
    tipo: input.tipo,
    valor: input.valor.toString(),
    descricao: input.descricao.trim(),
    responsavel: input.tipo === "compra" ? (input.responsavel ?? null) : null,
    observacao: input.observacao?.trim() || null,
  });

  const delta = input.tipo === "deposito" ? input.valor : -input.valor;
  const newEstimate = toNumber(balance.currentEstimate) + delta;
  await db
    .update(mercadopagoBalances)
    .set({ currentEstimate: newEstimate.toString(), updatedAt: new Date() })
    .where(eq(mercadopagoBalances.mlUserId, input.mlUserId));

  revalidatePath("/liberacoes");
  return { ok: true, message: "Transação registrada." };
}

/**
 * Desfaz uma movimentação manual: reverte o efeito dela no currentEstimate
 * (soma de volta se era compra, subtrai se era depósito) e apaga o
 * registro — pra corrigir um lançamento feito errado.
 */
export async function excluirTransacaoManual(id: string): Promise<void> {
  const [transacao] = await db
    .select()
    .from(mercadopagoManualTransactions)
    .where(eq(mercadopagoManualTransactions.id, id))
    .limit(1);
  if (!transacao) return;

  const [balance] = await db
    .select()
    .from(mercadopagoBalances)
    .where(eq(mercadopagoBalances.mlUserId, transacao.mlUserId))
    .limit(1);

  if (balance) {
    const reversal = transacao.tipo === "deposito" ? -toNumber(transacao.valor) : toNumber(transacao.valor);
    const newEstimate = toNumber(balance.currentEstimate) + reversal;
    await db
      .update(mercadopagoBalances)
      .set({ currentEstimate: newEstimate.toString(), updatedAt: new Date() })
      .where(eq(mercadopagoBalances.mlUserId, transacao.mlUserId));
  }

  await db.delete(mercadopagoManualTransactions).where(eq(mercadopagoManualTransactions.id, id));
  revalidatePath("/liberacoes");
}

/** Soma o netAmount das vendas do Mercado Livre já liberadas nesse período, para essa conta. */
async function sumReleasedSalesNetAmount(
  mlUserId: string,
  periodStartISO: string,
  periodEndISO: string
): Promise<number> {
  const rows = await db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.mlSellerId, mlUserId),
        eq(sales.source, "mercadolivre"),
        eq(sales.moneyReleaseStatus, "released"),
        isNotNull(sales.moneyReleaseDate),
        gte(sales.moneyReleaseDate, new Date(`${periodStartISO}T00:00:00.000Z`)),
        lte(sales.moneyReleaseDate, new Date(`${periodEndISO}T23:59:59.999Z`))
      )
    );

  return rows.reduce((sum, row) => {
    const sale = withFinancials(row);
    return sum + (sale.revenue - sale.saleFeeAmount - sale.shippingTotal);
  }, 0);
}

export interface SyncBalanceResult {
  ok: boolean;
  pending: boolean;
  message: string;
}

/**
 * Sincroniza o saldo estimado de uma conta: se já tem um relatório de
 * liquidação pedido e ainda não conferido, só verifica se ficou pronto
 * (não pede um relatório novo — evita duplicar pedidos enquanto o usuário
 * fica clicando). Senão, pede um relatório novo cobrindo do dia seguinte à
 * última sincronização até hoje.
 */
export async function syncAccountBalance(mlUserId: string): Promise<SyncBalanceResult> {
  const rows = await db
    .select()
    .from(mercadopagoBalances)
    .where(eq(mercadopagoBalances.mlUserId, mlUserId))
    .limit(1);
  const balance = rows[0];

  if (!balance) {
    return { ok: false, pending: false, message: "Defina o saldo inicial dessa conta antes de sincronizar." };
  }

  const accessToken = await getValidAccessTokenForAccount(mlUserId);

  if (balance.pendingReportId) {
    const status = await checkSettlementReportStatus(accessToken, Number(balance.pendingReportId));

    if (!status) {
      return {
        ok: true,
        pending: true,
        message: "Relatório ainda não apareceu na Mercado Pago — tenta de novo em alguns minutos.",
      };
    }

    if (status.status === "failed") {
      await db
        .update(mercadopagoBalances)
        .set({ pendingReportId: null, pendingReportPeriodStart: null, pendingReportPeriodEnd: null, pendingReportRequestedAt: null, updatedAt: new Date() })
        .where(eq(mercadopagoBalances.mlUserId, mlUserId));
      return { ok: false, pending: false, message: "O relatório falhou ao gerar na Mercado Pago. Clique em atualizar para tentar de novo." };
    }

    if (status.status !== "processed" || !status.file_name) {
      return { ok: true, pending: true, message: "Ainda gerando o relatório na Mercado Pago — tenta de novo em alguns minutos." };
    }

    const periodStart = balance.pendingReportPeriodStart!;
    const periodEnd = balance.pendingReportPeriodEnd!;
    const reportRows = await downloadSettlementReport(accessToken, status.file_name);
    const summary = summarizeMovements(reportRows);
    const inflow = await sumReleasedSalesNetAmount(mlUserId, periodStart, periodEnd);
    const newEstimate = toNumber(balance.currentEstimate) + inflow + summary.withdrawalsTotal + summary.otherAdjustmentsTotal;
    const syncedAtLabel = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    await db
      .update(mercadopagoBalances)
      .set({
        currentEstimate: newEstimate.toString(),
        lastSyncedThroughDate: periodEnd,
        lastSyncedAt: new Date(),
        lastSyncSummary: formatMovementsSummary(summary, syncedAtLabel),
        pendingReportId: null,
        pendingReportPeriodStart: null,
        pendingReportPeriodEnd: null,
        pendingReportRequestedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(mercadopagoBalances.mlUserId, mlUserId));

    revalidatePath("/liberacoes");
    return { ok: true, pending: false, message: "Saldo atualizado." };
  }

  const periodStart = addDays(balance.lastSyncedThroughDate, 1);
  const periodEnd = todayISO();

  if (periodStart > periodEnd) {
    await db
      .update(mercadopagoBalances)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(mercadopagoBalances.mlUserId, mlUserId));
    revalidatePath("/liberacoes");
    return { ok: true, pending: false, message: "Já está em dia." };
  }

  await ensureSettlementReportConfig(accessToken);
  const request = await requestSettlementReport(accessToken, periodStart, periodEnd);

  await db
    .update(mercadopagoBalances)
    .set({
      pendingReportId: String(request.id),
      pendingReportPeriodStart: periodStart,
      pendingReportPeriodEnd: periodEnd,
      pendingReportRequestedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mercadopagoBalances.mlUserId, mlUserId));

  revalidatePath("/liberacoes");
  return {
    ok: true,
    pending: true,
    message: "Pedido enviado à Mercado Pago. A geração do relatório demora alguns minutos — clique em atualizar de novo daqui a pouco.",
  };
}
