import Link from "next/link";
import { ArrowRight, Clock, CreditCard, DollarSign, Percent, Receipt, ShoppingBag, Truck } from "lucide-react";
import { getSalesForRange } from "@/actions/sales";
import { getMonthlyGoal } from "@/actions/goals";
import { getSettings } from "@/actions/settings";
import { listProducts } from "@/actions/products";
import { DashboardFilterBar } from "@/components/dashboard/DashboardFilterBar";
import { FeeCard } from "@/components/dashboard/FeeCard";
import { GoalCard } from "@/components/dashboard/GoalCard";
import { PartnerSplitCard } from "@/components/dashboard/PartnerSplitCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { RevenueChart, type DailyPoint } from "@/components/dashboard/RevenueChart";
import { TopProducts, type TopProductRow } from "@/components/dashboard/TopProducts";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { formatCurrency, formatDate, formatPercent, currentYearMonth } from "@/lib/format";
import { daysBetweenInclusive, isoRangeDays, isoRangeMonths, monthRange, percentChange, previousPeriod, previousYearMonth } from "@/lib/dates";
import { resolveDashboardPeriod, type PeriodKey } from "@/lib/dashboard-period";

export const dynamic = "force-dynamic";

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default async function DashboardPage(props: PageProps<"/">) {
  const searchParams = await props.searchParams;
  const periodoParam = typeof searchParams.periodo === "string" ? searchParams.periodo : undefined;
  const deParam = typeof searchParams.de === "string" && searchParams.de ? searchParams.de : undefined;
  const ateParam = typeof searchParams.ate === "string" && searchParams.ate ? searchParams.ate : undefined;
  const productId = typeof searchParams.produto === "string" && searchParams.produto ? searchParams.produto : undefined;

  const { periodo, from, to } = resolveDashboardPeriod({ periodo: periodoParam, de: deParam, ate: ateParam });

  // A meta de faturamento acompanha o filtro de período quando ele
  // corresponde a um mês-calendário inteiro ("Este mês"/"Mês passado"), já
  // que cada mês tem sua própria meta cadastrada. Para janelas arbitrárias
  // (últimos 7 dias, este ano, tudo, personalizado) não existe uma meta
  // única que faça sentido, então caímos de volta no mês atual.
  const yearMonth =
    periodo === "mes-passado" ? previousYearMonth(currentYearMonth()) : currentYearMonth();
  const { from: goalFrom, to: goalTo } = monthRange(yearMonth);

  const prevPeriod = from && to ? previousPeriod(from, to) : null;

  const [goal, products, currentSales, goalMonthSales, partnerSettings, previousSales] = await Promise.all([
    getMonthlyGoal(yearMonth),
    listProducts(),
    getSalesForRange(from, to, productId),
    getSalesForRange(goalFrom, goalTo),
    getSettings(),
    prevPeriod ? getSalesForRange(prevPeriod.from, prevPeriod.to, productId) : Promise.resolve([]),
  ]);

  const totals = currentSales.reduce(
    (acc, s) => {
      acc.revenue += s.revenue;
      acc.profit += s.profit;
      acc.quantity += s.quantity;
      acc.reserveAmount += s.reserveAmount;
      acc.juanTotal += s.juanTotal;
      acc.djowTotal += s.djowTotal;
      acc.shippingTotal += s.shippingTotal;
      acc.saleFeeTotal += s.saleFeeAmount;
      if (s.orderStatus === "pendente") acc.pending += 1;
      return acc;
    },
    { revenue: 0, profit: 0, quantity: 0, pending: 0, reserveAmount: 0, juanTotal: 0, djowTotal: 0, shippingTotal: 0, saleFeeTotal: 0 }
  );
  const avgMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
  // Taxa de envio: valor total pago em frete no período e quanto isso
  // representa, em média, sobre o faturamento (peso pela receita de cada
  // venda — a mesma lógica usada na margem média acima).
  const avgShippingPercent = totals.revenue > 0 ? (totals.shippingTotal / totals.revenue) * 100 : 0;
  // Taxa de venda: comissão total do marketplace no período e quanto isso
  // representa, em média, sobre o faturamento.
  const avgSaleFeePercent = totals.revenue > 0 ? (totals.saleFeeTotal / totals.revenue) * 100 : 0;
  const goalMonthRevenue = goalMonthSales.reduce((sum, s) => sum + s.revenue, 0);

  const prevTotals = previousSales.reduce(
    (acc, s) => {
      acc.revenue += s.revenue;
      acc.profit += s.profit;
      return acc;
    },
    { revenue: 0, profit: 0 }
  );
  const hasComparison = Boolean(from && to);

  // Monta o gráfico com granularidade diária para períodos curtos (até ~2
  // meses) e mensal para janelas mais longas (ex: "este ano" ou "todo o
  // período"), senão um intervalo de anos viraria um gráfico ilegível de
  // centenas de pontos.
  let chartFrom = from;
  let chartTo = to;
  if (!chartFrom || !chartTo) {
    if (currentSales.length > 0) {
      const dates = currentSales.map((s) => s.saleDate).sort();
      chartFrom = chartFrom ?? dates[0];
      chartTo = chartTo ?? dates[dates.length - 1];
    } else {
      const range = monthRange(yearMonth);
      chartFrom = chartFrom ?? range.from;
      chartTo = chartTo ?? range.to;
    }
  }
  const spanDays = daysBetweenInclusive(chartFrom, chartTo);
  const granularity: "day" | "month" = spanDays <= 62 ? "day" : "month";

  let chartData: DailyPoint[];
  if (granularity === "day") {
    const dailyMap = new Map<string, { revenue: number; profit: number }>();
    for (const day of isoRangeDays(chartFrom, chartTo)) dailyMap.set(day, { revenue: 0, profit: 0 });
    for (const sale of currentSales) {
      const entry = dailyMap.get(sale.saleDate) ?? { revenue: 0, profit: 0 };
      entry.revenue += sale.revenue;
      entry.profit += sale.profit;
      dailyMap.set(sale.saleDate, entry);
    }
    chartData = Array.from(dailyMap.entries()).map(([date, v]) => ({
      label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      revenue: Math.round(v.revenue * 100) / 100,
      profit: Math.round(v.profit * 100) / 100,
    }));
  } else {
    const monthlyMap = new Map<string, { revenue: number; profit: number }>();
    for (const ym of isoRangeMonths(chartFrom, chartTo)) monthlyMap.set(ym, { revenue: 0, profit: 0 });
    for (const sale of currentSales) {
      const ym = sale.saleDate.slice(0, 7);
      const entry = monthlyMap.get(ym) ?? { revenue: 0, profit: 0 };
      entry.revenue += sale.revenue;
      entry.profit += sale.profit;
      monthlyMap.set(ym, entry);
    }
    chartData = Array.from(monthlyMap.entries()).map(([ym, v]) => {
      const [y, m] = ym.split("-").map(Number);
      return {
        label: `${MONTH_ABBR[m - 1]}/${String(y).slice(2)}`,
        revenue: Math.round(v.revenue * 100) / 100,
        profit: Math.round(v.profit * 100) / 100,
      };
    });
  }

  const byProduct = new Map<string, TopProductRow>();
  for (const sale of currentSales) {
    const row = byProduct.get(sale.productNameSnapshot) ?? {
      name: sale.productNameSnapshot,
      revenue: 0,
      profit: 0,
      quantity: 0,
      shippingTotal: 0,
    };
    row.revenue += sale.revenue;
    row.profit += sale.profit;
    row.quantity += sale.quantity;
    row.shippingTotal += sale.shippingTotal;
    byProduct.set(sale.productNameSnapshot, row);
  }
  const topProducts = Array.from(byProduct.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const recent = [...currentSales].reverse().slice(0, 6);

  const selectedProductName = productId ? products.find((p) => p.id === productId)?.name : undefined;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto animate-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">
            Visão geral das vendas no período selecionado
            {selectedProductName ? ` — ${selectedProductName}` : ""}.
          </p>
        </div>
        <LinkButton href="/vendas" variant="outline">
          Ver vendas realizadas <ArrowRight size={16} />
        </LinkButton>
      </div>

      <DashboardFilterBar
        products={products}
        current={{ periodo: periodo as PeriodKey, de: deParam, ate: ateParam, produto: productId }}
        resolvedFrom={from}
        resolvedTo={to}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2 md:row-span-2">
          <GoalCard yearMonth={yearMonth} goal={goal} revenue={goalMonthRevenue} />
        </div>
        <div className="md:col-span-2 md:row-span-2">
          <PartnerSplitCard
            reserveAmount={totals.reserveAmount}
            juanTotal={totals.juanTotal}
            djowTotal={totals.djowTotal}
            operationalFeePercent={partnerSettings.operationalFeePercent}
            reservePercent={partnerSettings.reservePercent}
          />
        </div>
        <StatCard
          label="Faturamento no período"
          value={formatCurrency(totals.revenue)}
          icon={DollarSign}
          changePercent={hasComparison ? percentChange(totals.revenue, prevTotals.revenue) : null}
        />
        <StatCard
          label="Lucro no período"
          value={formatCurrency(totals.profit)}
          icon={ShoppingBag}
          changePercent={hasComparison ? percentChange(totals.profit, prevTotals.profit) : null}
          tone={totals.profit >= 0 ? "success" : "danger"}
        />
        <StatCard label="Margem média" value={formatPercent(avgMargin)} icon={Percent} />
        <StatCard label="Pedidos pendentes" value={String(totals.pending)} icon={Truck} tone={totals.pending > 0 ? "danger" : "neutral"} />
        <div className="md:col-span-2">
          <FeeCard
            label="Taxa de envio"
            icon={Receipt}
            totalValue={formatCurrency(totals.shippingTotal)}
            percentValue={formatPercent(avgShippingPercent)}
          />
        </div>
        <div className="md:col-span-2">
          <FeeCard
            label="Taxa de venda"
            icon={CreditCard}
            totalValue={formatCurrency(totals.saleFeeTotal)}
            percentValue={formatPercent(avgSaleFeePercent)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Receita x Lucro no período</h2>
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
          <p className="text-sm text-muted py-6 text-center">Nenhuma venda registrada nesse período.</p>
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
