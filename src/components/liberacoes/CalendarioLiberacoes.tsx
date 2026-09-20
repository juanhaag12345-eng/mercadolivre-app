"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCurrency, todayISO } from "@/lib/format";
import { daysInMonth } from "@/lib/dates";
import { monthLabel, currentYearMonth, yearMonthOf } from "@/lib/format";
import type { LiberacaoCalendarData } from "@/actions/liberacoes";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

function shiftYearMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Calendário mensal no topo de /liberacoes — cada dia com liberação
 * prevista mostra quantas vendas e o valor total daquele dia, pra dar uma
 * visão rápida de quando o dinheiro cai na conta. Começa mostrando o mês da
 * liberação mais próxima (não necessariamente o mês atual), porque é o que
 * importa primeiro.
 */
export function CalendarioLiberacoes({
  data,
  accountInitials,
  legend,
}: {
  data: LiberacaoCalendarData;
  // mlSellerId -> letra pra marcar no calendário (ex.: "R" pra RADAR
  // OFERTAS, "V" pra VAREJO EM MOVIMENTO) — vem da primeira letra do
  // apelido de cada conta conectada. Quando o dia tem liberação das duas
  // contas, mostra as letras juntas (ex.: "RV").
  accountInitials: Record<string, string>;
  legend: { letter: string; label: string }[];
}) {
  const byDate = useMemo(() => new Map(data.days.map((d) => [d.date, d])), [data.days]);

  const initialMonth = data.days.length > 0 ? yearMonthOf(data.days[0].date) : currentYearMonth();
  const [yearMonth, setYearMonth] = useState(initialMonth);

  const dates = daysInMonth(yearMonth);
  const firstWeekday = new Date(dates[0] + "T00:00:00").getDay();
  const leadingBlanks = Array.from({ length: firstWeekday }, (_, i) => `blank-${i}`);

  const monthTotal = dates.reduce((sum, d) => sum + (byDate.get(d)?.total ?? 0), 0);
  const monthCount = dates.reduce((sum, d) => sum + (byDate.get(d)?.count ?? 0), 0);

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <CalendarDays size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold capitalize">{monthLabel(yearMonth)}</p>
            <p className="text-xs text-muted">
              {monthCount > 0 ? `${monthCount} liberação(ões) · ${formatCurrency(monthTotal)}` : "Nenhuma liberação prevista nesse mês"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" onClick={() => setYearMonth((m) => shiftYearMonth(m, -1))}>
            <ChevronLeft size={16} />
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={() => setYearMonth((m) => shiftYearMonth(m, 1))}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={`wd-${i}`} className="text-[11px] font-semibold text-muted py-1">
            {w}
          </div>
        ))}
        {leadingBlanks.map((key) => (
          <div key={key} />
        ))}
        {dates.map((date) => {
          const day = byDate.get(date);
          const dayNumber = Number(date.slice(-2));
          const isToday = date === todayISO();
          const letters = day
            ? Array.from(new Set(day.mlSellerIds.map((id) => accountInitials[id] ?? "?")))
                .sort()
                .join("")
            : "";
          return (
            <div
              key={date}
              className={`min-h-16 rounded-lg border p-1 flex flex-col items-center justify-start gap-0.5 ${
                day ? "border-success/40 bg-success-soft" : "border-border bg-surface"
              } ${isToday ? "ring-2 ring-accent" : ""}`}
            >
              <div className="flex w-full items-center justify-between px-0.5">
                <span className={`text-[11px] ${day ? "font-bold text-success" : "text-muted"}`}>{dayNumber}</span>
                {letters && (
                  <span className="rounded bg-success text-white text-[9px] font-bold leading-none px-1 py-0.5">
                    {letters}
                  </span>
                )}
              </div>
              {day && (
                <>
                  <span className="text-[10px] font-semibold text-success leading-tight text-center">
                    {formatCurrency(day.total)}
                  </span>
                  <span className="text-[9px] text-success/80">{day.count}x</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-border">
          {legend.map((l) => (
            <span key={l.letter} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="rounded bg-success text-white text-[9px] font-bold leading-none px-1 py-0.5">
                {l.letter}
              </span>
              {l.label}
            </span>
          ))}
        </div>
      )}

      {data.semPrevisao.count > 0 && (
        <p className="text-xs text-muted mt-3 pt-3 border-t border-border">
          + {data.semPrevisao.count} venda(s) ainda sem previsão de liberação ({formatCurrency(data.semPrevisao.total)})
          — clique em &ldquo;Atualizar liberações&rdquo; pra consultar.
        </p>
      )}
    </Card>
  );
}
