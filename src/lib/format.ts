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

// Fuso horário do negócio, usado abaixo em formatTime — precisa ser
// explícito porque em produção o servidor roda em UTC.
const FORMAT_TIME_ZONE = "America/Sao_Paulo";

export function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FORMAT_TIME_ZONE,
  }).format(value);
}

export function formatDateLong(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value + "T00:00:00") : value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

// Fuso horário do negócio (Brasília). Precisa ser fixo porque o servidor em
// produção roda em UTC, então "hoje" calculado com o fuso local do processo
// (getTimezoneOffset) ficava adiantado em relação ao dia real do usuário
// entre ~21h e meia-noite no horário de Brasília — fazendo vendas recém
// registradas "sumirem" do dashboard do mês por caírem no mês seguinte.
const APP_TIME_ZONE = "America/Sao_Paulo";

export function todayISO(): string {
  // en-CA formata datas como AAAA-MM-DD, então isso já sai no formato ISO
  // que o resto do app espera, sempre no fuso do negócio, não no do processo.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(new Date());
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
