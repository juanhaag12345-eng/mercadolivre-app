"use client";

import { useState, useTransition } from "react";
import { Wallet, Loader2, RefreshCw, Pencil } from "lucide-react";
import { Card, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { setBalanceBaseline, syncAccountBalance, type AccountBalanceRow } from "@/actions/mercadopago-balance";

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

function AccountBalanceItem({ account }: { account: AccountBalanceRow }) {
  const [editing, setEditing] = useState(!account.hasBaseline);
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
    </div>
  );
}

export function SaldoMercadoPagoCard({ accounts }: { accounts: AccountBalanceRow[] }) {
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
          <AccountBalanceItem key={a.mlUserId} account={a} />
        ))}
      </div>
    </Card>
  );
}
