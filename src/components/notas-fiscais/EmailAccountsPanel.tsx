"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Mail, Plus, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { scanNowAction } from "@/actions/nfe";
import { formatDate, formatTime } from "@/lib/format";
import type { NfeEmailAccount } from "@/db/schema";

export function EmailAccountsPanel({ accounts }: { accounts: NfeEmailAccount[] }) {
  const [scanning, startScanTransition] = useTransition();
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-muted" />
          <h2 className="font-semibold">Caixas de e-mail conectadas</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={scanning}
            onClick={() =>
              startScanTransition(async () => {
                const result = await scanNowAction();
                setScanMessage(result.message);
              })
            }
          >
            <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
            Verificar e-mails agora
          </Button>
          <a href="/api/email-nfe/authorize">
            <Button type="button" variant="outline" size="sm">
              <Plus size={14} />
              Conectar conta
            </Button>
          </a>
        </div>
      </div>

      {scanMessage && <p className="text-xs text-muted">{scanMessage}</p>}

      {accounts.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhuma conta conectada ainda. Clique em &quot;Conectar conta&quot; e faça login com o
          Gmail que recebe as notas dos fornecedores.
        </p>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{account.email}</p>
                <p className="text-xs text-muted">
                  {account.lastScannedAt
                    ? `Última varredura: ${formatDate(account.lastScannedAt)} às ${formatTime(account.lastScannedAt)}`
                    : "Ainda não varrida"}
                </p>
              </div>
              {account.lastScanError ? (
                <span className="flex items-center gap-1 text-xs text-danger shrink-0" title={account.lastScanError}>
                  <AlertTriangle size={13} />
                  Erro na varredura
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-success shrink-0">
                  <CheckCircle2 size={13} />
                  OK
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
