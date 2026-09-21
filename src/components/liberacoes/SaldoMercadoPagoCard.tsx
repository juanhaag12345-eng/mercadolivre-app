"use client";

import { useState, useTransition } from "react";
import { Wallet, Loader2, RefreshCw, Pencil, Plus, X, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Card, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import {
  setBalanceBaseline,
  syncAccountBalance,
  registrarTransacaoManual,
  excluirTransacaoManual,
  type AccountBalanceRow,
  type ManualTransactionRow,
} from "@/actions/mercadopago-balance";
import { DISPATCHER_LABELS, DISPATCHERS, type ManualTransactionType } from "@/db/schema";

function BaselineForm({ mlUserId, onDone }: { mlUserId: string; onDone: () => void }) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const amount = Number(value.replace(",", "."));
        if (!Number.isFinite(amount)) return;
        startTransition(() => {
          setBalanceBaseline(mlUserId, amount).then(onDone);
        });
      }}
    >
      <input
        type="text"
        inputMode="decimal"
        placeholder="Saldo de hoje (ex: 1266,27)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 text-sm"
        autoFocus
      />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? <Loader2 size={14} className="animate-spin" /> : "Salvar"}
      </Button>
    </form>
  );
}

// Toda compra ou depósito feito usando o saldo Mercado Pago (fora do fluxo
// normal de vendas do Mercado Livre) passa por aqui — é o que mantém o
// saldo estimado batendo com a realidade quando a sincronização automática
// não tem como enxergar o movimento (ver registrarTransacaoManual).
function ManualTransactionForm({ mlUserId, onDone }: { mlUserId: string; onDone: () => void }) {
  const [tipo, setTipo] = useState<ManualTransactionType>("compra");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState<(typeof DISPATCHERS)[number]>("juan");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const amount = Number(valor.replace(",", "."));
        if (!Number.isFinite(amount) || amount <= 0) {
          setErro("Informe um valor válido, maior que zero.");
          return;
        }
        if (!descricao.trim()) {
          setErro(tipo === "compra" ? "Descreva qual compra foi realizada." : "Descreva o motivo do depósito.");
          return;
        }
        setErro(null);
        startTransition(() => {
          registrarTransacaoManual({
            mlUserId,
            tipo,
            valor: amount,
            descricao,
            responsavel: tipo === "compra" ? responsavel : null,
            observacao: tipo === "compra" ? observacao : null,
          }).then((r) => {
            if (r.ok) onDone();
            else setErro(r.message);
          });
        });
      }}
    >
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setTipo("compra")}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold flex items-center justify-center gap-1 ${
            tipo === "compra" ? "border-danger bg-danger-soft text-danger" : "border-border bg-surface text-muted"
          }`}
        >
          <ArrowUpCircle size={13} /> Compra (sai do saldo)
        </button>
        <button
          type="button"
          onClick={() => setTipo("deposito")}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold flex items-center justify-center gap-1 ${
            tipo === "deposito" ? "border-success bg-success-soft text-success" : "border-border bg-surface text-muted"
          }`}
        >
          <ArrowDownCircle size={13} /> Depósito (entra no saldo)
        </button>
      </div>

      <input
        type="text"
        inputMode="decimal"
        placeholder="Valor (ex: 5,00)"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="h-9 rounded-lg border border-border bg-surface px-3 text-sm"
      />

      <input
        type="text"
        placeholder={tipo === "compra" ? "Qual compra foi realizada" : "Motivo do depósito"}
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        className="h-9 rounded-lg border border-border bg-surface px-3 text-sm"
      />

      {tipo === "compra" && (
        <>
          <div className="flex gap-1.5">
            {DISPATCHERS.map((d) => (
              <button
                type="button"
                key={d}
                onClick={() => setResponsavel(d)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                  responsavel === d ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-muted"
                }`}
              >
                {DISPATCHER_LABELS[d]}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Observações (opcional)"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-sm"
          />
        </>
      )}

      {erro && <p className="text-[11px] text-danger">{erro}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2 size={14} className="animate-spin" /> : "Registrar"}
        </Button>
      </div>
    </form>
  );
}

function ManualTransactionList({ transactions }: { transactions: ManualTransactionRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (transactions.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      {transactions.map((t) => (
        <div
          key={t.id}
          className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs"
        >
          <div className="min-w-0">
            <p className="truncate">
              <span className={t.tipo === "deposito" ? "text-success font-semibold" : "text-danger font-semibold"}>
                {t.tipo === "deposito" ? "+" : "-"}
                {formatCurrency(t.valor)}
              </span>{" "}
              — {t.descricao}
              {t.responsavel && ` (${DISPATCHER_LABELS[t.responsavel]})`}
            </p>
            <p className="text-[10px] text-muted">
              {formatDate(t.createdAt)} às {formatTime(t.createdAt)}
              {t.observacao && ` · ${t.observacao}`}
            </p>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setDeletingId(t.id);
              startTransition(() => {
                excluirTransacaoManual(t.id).finally(() => setDeletingId(null));
              });
            }}
            className="shrink-0 text-muted hover:text-danger"
            title="Excluir lançamento"
          >
            {isPending && deletingId === t.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
          </button>
        </div>
      ))}
    </div>
  );
}

function AccountBalanceItem({
  account,
  manualTransactions,
}: {
  account: AccountBalanceRow;
  manualTransactions: ManualTransactionRow[];
}) {
  const [editing, setEditing] = useState(!account.hasBaseline);
  const [showManualForm, setShowManualForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 py-3 border-b border-border last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{account.nickname ?? `Vendedor ${account.mlUserId}`}</p>
        {account.hasBaseline && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-muted hover:text-foreground flex items-center gap-1"
          >
            <Pencil size={11} /> corrigir saldo
          </button>
        )}
      </div>

      {editing ? (
        <BaselineForm mlUserId={account.mlUserId} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{formatCurrency(account.currentEstimate ?? 0)}</p>
            {account.lastSyncedAt ? (
              <p className="text-[11px] text-muted">
                estimado · sincronizado em {formatDate(account.lastSyncedAt)} às {formatTime(account.lastSyncedAt)}
              </p>
            ) : (
              <p className="text-[11px] text-muted">estimado</p>
            )}
            {account.syncPending && (
              <Badge tone="warning" className="mt-1">
                sincronizando…
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => {
              setSyncMessage(null);
              startTransition(() => {
                syncAccountBalance(account.mlUserId).then((r) => setSyncMessage(r.message));
              });
            }}
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </Button>
        </div>
      )}
      {syncMessage && <p className="text-[11px] text-muted">{syncMessage}</p>}
      {account.lastSyncSummary && !syncMessage && (
        <p className="text-[11px] text-muted">{account.lastSyncSummary}</p>
      )}

      {account.hasBaseline && !editing && (
        <div className="mt-1 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted">Transações manuais</p>
            {!showManualForm && (
              <button
                type="button"
                onClick={() => setShowManualForm(true)}
                className="text-xs text-accent hover:underline flex items-center gap-1"
              >
                <Plus size={12} /> lançar
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted mt-0.5">
            Toda compra ou depósito feito usando o saldo dessa conta, fora do fluxo de vendas do Mercado Livre — ex.:
            PIX na conta, pagamento de fornecedor com o saldo — lance aqui, pra manter o saldo estimado certo.
          </p>

          {showManualForm && (
            <div className="mt-2">
              <ManualTransactionForm mlUserId={account.mlUserId} onDone={() => setShowManualForm(false)} />
            </div>
          )}

          <ManualTransactionList transactions={manualTransactions} />
        </div>
      )}
    </div>
  );
}

export function SaldoMercadoPagoCard({
  accounts,
  manualTransactionsByAccount,
}: {
  accounts: AccountBalanceRow[];
  manualTransactionsByAccount: Record<string, ManualTransactionRow[]>;
}) {
  const total = accounts.reduce((sum, a) => sum + (a.currentEstimate ?? 0), 0);
  const todasConfiguradas = accounts.length > 0 && accounts.every((a) => a.hasBaseline);

  if (accounts.length === 0) return null;

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Wallet size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold">Saldo Mercado Pago</p>
            <p className="text-xs text-muted">
              Estimativa por conta — não existe saldo em tempo real na API, o valor é atualizado a cada sincronização.
            </p>
          </div>
        </div>
        {todasConfiguradas && <p className="text-lg font-bold">{formatCurrency(total)}</p>}
      </div>

      <div>
        {accounts.map((a) => (
          <AccountBalanceItem
            key={a.mlUserId}
            account={a}
            manualTransactions={manualTransactionsByAccount[a.mlUserId] ?? []}
          />
        ))}
      </div>
    </Card>
  );
}
