"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/Card";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PURCHASE_ORIGIN_LABELS, type PaymentMethod } from "@/db/schema";
import type { StockItemAnalytics } from "@/actions/stock";

const COLORS = {
  price: "#eb6834",
  volume: "#2a78d6",
  grid: "#e1e0d9",
  axis: "#898781",
};

/**
 * Histórico de preços pagos por um item de estoque (com estatísticas de
 * mín/máx/último/médio) mais um gráfico simples comparando o preço médio
 * de compra com a quantidade vendida mês a mês — pra responder "onde
 * estou pagando mais barato" e "o preço tá afetando as vendas".
 */
export function PriceHistoryPanel({ analytics }: { analytics: StockItemAnalytics }) {
  const { history, stats, chart } = analytics;
  const hasChartData = chart.some((p) => p.avgPrice !== null || p.quantitySold > 0);

  if (history.length === 0) {
    return <p className="text-sm text-muted py-4 text-center">Nenhuma compra registrada pra esse item ainda.</p>;
  }

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatMini label="Menor preço" value={formatCurrency(stats.min)} />
          <StatMini label="Maior preço" value={formatCurrency(stats.max)} />
          <StatMini label="Último preço" value={formatCurrency(stats.last)} hint={stats.lastSupplier} />
          <StatMini label="Preço médio" value={formatCurrency(stats.avg)} />
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-muted mb-1.5">Preço de compra x quantidade vendida (últimos 6 meses)</p>
        {hasChartData ? (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={COLORS.grid} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.axis }} axisLine={{ stroke: COLORS.grid }} tickLine={false} />
              <YAxis
                yAxisId="volume"
                tick={{ fontSize: 11, fill: COLORS.axis }}
                axisLine={false}
                tickLine={false}
                width={32}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="price"
                orientation="right"
                tick={{ fontSize: 11, fill: COLORS.axis }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v) => formatCurrency(v).replace("R$", "").trim()}
              />
              <Tooltip
                formatter={(value, name) =>
                  name === "avgPrice"
                    ? [value === null ? "sem compra" : formatCurrency(Number(value)), "Preço médio"]
                    : [`${value} un.`, "Vendidas"]
                }
                labelStyle={{ color: "#0b0b0b", fontWeight: 600 }}
                contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 8px 24px rgba(16,24,40,0.08)" }}
              />
              <Bar yAxisId="volume" dataKey="quantitySold" fill={COLORS.volume} radius={[4, 4, 0, 0]} barSize={18} />
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="avgPrice"
                stroke={COLORS.price}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-muted py-6 text-center">Sem dados suficientes nos últimos 6 meses.</p>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted mb-1.5">Histórico de compras</p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted border-b border-border bg-surface-muted/60">
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Fornecedor</th>
                <th className="px-3 py-2 font-medium">Qtd.</th>
                <th className="px-3 py-2 font-medium">Preço</th>
                <th className="px-3 py-2 font-medium">Origem</th>
                <th className="px-3 py-2 font-medium">Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{formatDate(h.purchaseDate)}</td>
                  <td className="px-3 py-2">{h.supplier}</td>
                  <td className="px-3 py-2">{h.quantity}</td>
                  <td className="px-3 py-2">{formatCurrency(h.unitCost)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={h.origem === "nf" ? "accent" : "neutral"}>{PURCHASE_ORIGIN_LABELS[h.origem]}</Badge>
                  </td>
                  <td className="px-3 py-2">{PAYMENT_METHOD_LABELS[h.paymentMethod as PaymentMethod] ?? h.paymentMethod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatMini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted/40 px-3 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-sm font-semibold truncate">{value}</p>
      {hint && <p className="text-[11px] text-muted truncate">{hint}</p>}
    </div>
  );
}
