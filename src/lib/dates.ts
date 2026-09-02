export function monthRange(yearMonth: string): { from: string; to: string } {
  const [year, month] = yearMonth.split("-").map(Number);
  const from = `${yearMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export function previousYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(yearMonth: string): string[] {
  const [year, month] = yearMonth.split("-").map(Number);
  const total = new Date(year, month, 0).getDate();
  return Array.from({ length: total }, (_, i) => `${yearMonth}-${String(i + 1).padStart(2, "0")}`);
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

// ---- Helpers de período livre (usados pelos filtros do dashboard) ----

/** Soma (ou subtrai, com número negativo) dias a uma data ISO (AAAA-MM-DD). */
export function addDays(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Quantidade de dias entre duas datas ISO, incluindo os dois extremos. */
export function daysBetweenInclusive(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000) + 1;
}

/** Período imediatamente anterior, com a mesma duração — para comparação. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const length = daysBetweenInclusive(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(length - 1));
  return { from: prevFrom, to: prevTo };
}

/** Lista de todas as datas ISO entre from e to, incluindo os dois extremos. */
export function isoRangeDays(from: string, to: string): string[] {
  const length = daysBetweenInclusive(from, to);
  return Array.from({ length }, (_, i) => addDays(from, i));
}

/** Lista de todos os "AAAA-MM" entre os meses de from e to, incluindo os dois extremos. */
export function isoRangeMonths(from: string, to: string): string[] {
  const out: string[] = [];
  let [year, month] = from.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = to.slice(0, 7).split("-").map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}
