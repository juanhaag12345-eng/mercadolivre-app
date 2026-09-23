import { addDays, monthRange, previousYearMonth } from "@/lib/dates";
import { currentYearMonth, todayISO } from "@/lib/format";

export type PeriodKey =
  | "mes-atual"
  | "mes-passado"
  | "7-dias"
  | "30-dias"
  | "este-ano"
  | "tudo"
  | "personalizado";

export interface ResolvedPeriod {
  periodo: PeriodKey;
  // undefined em from/to só acontece com periodo "tudo" (sem limite de data)
  from?: string;
  to?: string;
}

/**
 * Resolve os parâmetros de busca do filtro do dashboard (?periodo=&de=&ate=)
 * em um intervalo de datas concreto. Os campos "De"/"Até" do formulário são
 * independentes do dropdown "Período" — dá pra editar as datas sem trocar o
 * preset selecionado — então qualquer "De"/"Até" preenchido manualmente tem
 * prioridade sobre o preset, mesmo que o dropdown ainda esteja marcado em
 * "Este mês" ou outro preset (do contrário a data digitada é simplesmente
 * ignorada). Sem nenhum filtro, cai no padrão de sempre: o mês atual.
 */
export function resolveDashboardPeriod(params: {
  periodo?: string;
  de?: string;
  ate?: string;
}): ResolvedPeriod {
  const { periodo, de, ate } = params;
  const today = todayISO();

  if (periodo === "personalizado" || de || ate) {
    return { periodo: "personalizado", from: de || undefined, to: ate || today };
  }

  switch (periodo) {
    case "mes-passado": {
      const range = monthRange(previousYearMonth(currentYearMonth()));
      return { periodo: "mes-passado", ...range };
    }
    case "7-dias":
      return { periodo: "7-dias", from: addDays(today, -6), to: today };
    case "30-dias":
      return { periodo: "30-dias", from: addDays(today, -29), to: today };
    case "este-ano":
      return { periodo: "este-ano", from: `${today.slice(0, 4)}-01-01`, to: today };
    case "tudo":
      return { periodo: "tudo", from: undefined, to: undefined };
    case "mes-atual":
    default: {
      const range = monthRange(currentYearMonth());
      return { periodo: "mes-atual", ...range };
    }
  }
}
