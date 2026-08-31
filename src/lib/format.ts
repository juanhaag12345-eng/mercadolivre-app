export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number, digits = 1): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value + "T00:00:00") : value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateLong(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value + "T00:00:00") : value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function todayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export function yearMonthOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export function currentYearMonth(): string {
  return todayISO().slice(0, 7);
}

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return `${MONTH_LABELS[(month ?? 1) - 1]} de ${year}`;
}
