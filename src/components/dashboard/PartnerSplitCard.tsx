"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, PiggyBank, Settings2, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PercentInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { updateSettings } from "@/actions/settings";
import { formatCurrency } from "@/lib/format";
import { DISPATCHER_LABELS } from "@/db/schema";

export function PartnerSplitCard({
  reserveAmount,
  juanTotal,
  djowTotal,
  operationalFeePercent,
  reservePercent,
}: {
  reserveAmount: number;
  juanTotal: number;
  djowTotal: number;
  operationalFeePercent: number;
  reservePercent: number;
}) {
  const [editing, setEditing] = useState(false);
  const [feeValue, setFeeValue] = useState(operationalFeePercent);
  const [reserveValue, setReserveValue] = useState(reservePercent);
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-neutral-900">
            <PiggyBank size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold">Divisão de rendimentos</p>
            <p className="text-xs text-muted">Reserva da empresa e ganhos dos sócios no mês</p>
          </div>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted"
            title="Editar percentuais"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Settings2 size={13} />
            Percentuais usados nas próximas vendas registradas
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Remuneração operacional</label>
              <PercentInput value={feeValue} onValueChange={setFeeValue} className="h-11" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Reserva da empresa</label>
              <PercentInput value={reserveValue} onValueChange={setReserveValue} className="h-11" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setFeeValue(operationalFeePercent);
                setReserveValue(reservePercent);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await updateSettings(feeValue, reserveValue);
                  setEditing(false);
                })
              }
            >
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Salvar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl bg-surface-muted px-3 py-2.5">
            <p className="text-xs text-muted">Reserva da empresa ({reservePercent}% do lucro da venda)</p>
            <p className="text-lg font-bold">{formatCurrency(reserveAmount)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Users size={12} /> {DISPATCHER_LABELS.juan}
              </div>
              <p className="text-lg font-bold">{formatCurrency(juanTotal)}</p>
            </div>
            <div className="rounded-xl border border-border px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Users size={12} /> {DISPATCHER_LABELS.djow}
              </div>
              <p className="text-lg font-bold">{formatCurrency(djowTotal)}</p>
            </div>
          </div>
          <p className="text-xs text-muted">
            Remuneração operacional de {operationalFeePercent}% vai inteira para quem despachou; o restante do lucro é
            sempre dividido 50/50 entre os dois sócios.
          </p>
        </div>
      )}
    </Card>
  );
}
