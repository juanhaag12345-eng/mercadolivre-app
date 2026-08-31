import Link from "next/link";
import { ArrowRight, Clock, DollarSign, Percent, ShoppingBag, Truck } from "lucide-react";
import { getSalesForRange } from "@/actions/sales";
import { getMonthlyGoal } from "@/actions/goals";
import { GoalCard } from "@/components/dashboard/GoalCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { RevenueChart, type DailyPoint } from "@/components/dashboard/RevenueChart";
import { TopProducts, type TopProductRow } from "@/components/dashboard/TopProducts";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { formatCurrency, formatDate, formatPercent, currentYearMonth } from "@/lib/format";
import { daysInMonth, monthRange, percentChange, previousYearMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const yearMonth = currentYearMonth();
  const prevYearMonth = previousYearMonth(yearMonth);
  const { from, to } = monthRange(yearMonth);
  const { from: prevFrom, to: prevTo } = monthRange(prevYearMonth);

  const [goal, currentSales, previousSales] = await Promise.all([
    getMonthlyGoal(yearMonth),
    getSalesForRange(from, to),
    getSalesForRange(prevFrom, prevTo),
  ]);

  const totals = currentSales.reduce(
    (acc, s) => {
      acc.revenue += s.revenue;
      acc.profit += s.profit;
      acc.quantity += s.quantity;
      if (s.orderStatus === "pendente") acc.pending += 1;
      return acc;
    },
    { revenue: 0, profit: 0, quantity: 0, pending: 0 }
  );
  const avgMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  const prevTotals = previousSales.reduce(
    (acc, s) => {
      acc.revenue += s.revenue;
      acc.profit += s.profit;
      return acc;
    },
    { revenue: 0, profit: 0 }
  );

  const dailyMap = new Map<string, { revenue: number; profit: number }>();
  for (const day of daysInMonth(yearMonth)) dailyMap.set(day, { revenue: 0, profit: 0 });
  for (const sale of currentSales) {
    const entry = dailyMap.get(sale.saleDate) ?? { revenue: 0, profit: 0 };
    entry.revenue += sale.revenue;
    entry.profit += sale.profit;
    dailyMap.set(sale.saleDate, entry);
  }
  const chartData: DailyPoint[] = Array.from(dailyMap.entries()).map(([date, v]) => ({
    label: date.slice(8, 10),
    revenue: Math.round(v.revenue * 100) / 100,
    profit: Math.round(v.profit * 100) / 100,
  }));

  const byProduct = new Map<string, TopProductRow>();
  for (const sale of currentSales) {
    const row = byProduct.get(sale.productNameSnapshot) ?? {
      name: sale.productNameSnapshot,
      revenue: 0,
      profit: 0,
      quantity: 0,
    };
    row.revenue += sale.revenue;
    row.profit += sale.profit;
    row.quantity += sale.quantity;
    byProduct.set(sale.productNameSnapshot, row);
  }
  const topProducts = Array.from(byProduct.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const recent = [...currentSales].reverse().slice(0, 6);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto animate-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">Visão geral das vendas deste mês.</p>
        </div>
        <LinkButton href="/vendas" variant="outline">
          Ver vendas realizadas <ArrowRight size={16} />
        </LinkButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2 md:row-span-2">
          <GoalCard yearMonth={yearMonth} goal={goal} revenue={totals.revenue} />
        </div>
        <StatCard
          label="Faturamento do mês"
          value={formatCurrency(totals.revenue)}
          icon={DollarSign}
          changePercent={percentChange(totals.revenue, prevTotals.revenue)}
        />
        <StatCard
          label="Lucro do mês"
          value={formatCurrency(totals.profit)}
          icon={ShoppingBag}
          changePercent={percentChange(totals.profit, prevTotals.profit)}
          tone={totals.profit >= 0 ? "success" : "danger"}
        />
        <StatCard label="Margem média" value={formatPercent(avgMargin)} icon={Percent} />
        <StatCard label="Pedidos pendentes" value={String(totals.pending)} icon={Truck} tone={totals.pending > 0 ? "danger" : "neutral"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Receita x Lucro no mês</h2>
          </div>
          <RevenueChart data={chartData} />
        </Card>
        <TopProducts rows={topProducts} />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-muted" />
            <h2 className="font-semibold">Últimas vendas</h2>
          </div>
          <Link href="/vendas" className="text-sm text-accent font-medium hover:underline">
            Ver todas
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">Nenhuma venda registrada ainda este mês.</p>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{sale.productNameSnapshot}</p>
                  <p className="text-xs text-muted">{formatDate(sale.saleDate)}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="font-semibold">{formatCurrency(sale.revenue)}</p>
                  <p className={`text-xs ${sale.profit >= 0 ? "text-success" : "text-danger"}`}>
                    lucro {formatCurrency(sale.profit)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
