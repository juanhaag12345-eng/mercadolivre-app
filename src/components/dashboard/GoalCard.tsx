"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, Target } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { MoneyInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { setMonthlyGoal } from "@/actions/goals";
import { formatCurrency, formatPercent, monthLabel } from "@/lib/format";

export function GoalCard({
  yearMonth,
  goal,
  revenue,
}: {
  yearMonth: string;
  goal: number;
  revenue: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(goal);
  const [isPending, startTransition] = useTransition();

  const percent = goal > 0 ? Math.min(100, (revenue / goal) * 100) : 0;
  const remaining = Math.max(0, goal - revenue);

  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-neutral-900">
            <Target size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold">Meta de faturamento</p>
            <p className="text-xs text-muted">{monthLabel(yearMonth)}</p>
          </div>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <MoneyInput
            autoFocus
            value={value}
            onChange={(e) => setValue(Number(e.target.value) || 0)}
            className="h-11"
          />
          <Button
            size="icon"
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await setMonthlyGoal(yearMonth, value);
                setEditing(false);
              })
            }
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          </Button>
        </div>
      ) : goal > 0 ? (
        <>
          <div className="flex items-end justify-between mb-2">
            <p className="text-2xl font-bold">{formatCurrency(revenue)}</p>
            <p className="text-sm text-muted">de {formatCurrency(goal)}</p>
          </div>
          <div className="h-2.5 w-full rounded-full bg-surface-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-brand transition-all duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs">
            <span className="font-semibold text-neutral-700">{formatPercent(percent, 0)} da meta</span>
            <span className="text-muted">
              {remaining > 0 ? `Faltam ${formatCurrency(remaining)}` : "Meta batida! 🎉"}
            </span>
          </div>
        </>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full rounded-xl border border-dashed border-border py-4 text-sm text-muted hover:border-accent hover:text-accent transition-colors"
        >
          + Definir meta do mês
        </button>
      )}
    </Card>
  );
}
