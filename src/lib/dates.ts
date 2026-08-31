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
