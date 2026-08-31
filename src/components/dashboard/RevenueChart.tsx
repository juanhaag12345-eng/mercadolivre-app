"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";

export interface DailyPoint {
  label: string;
  revenue: number;
  profit: number;
}

const COLORS = {
  revenue: "#2a78d6",
  profit: "#eb6834",
  grid: "#e1e0d9",
  axis: "#898781",
};

export function RevenueChart({ data }: { data: DailyPoint[] }) {
  const hasData = data.some((d) => d.revenue > 0 || d.profit > 0);

  if (!hasData) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted">
        Sem vendas registradas nesse período ainda.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.revenue} stopOpacity={0.16} />
            <stop offset="100%" stopColor={COLORS.revenue} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: COLORS.axis }}
          axisLine={{ stroke: COLORS.grid }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: COLORS.axis }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v) => formatCurrency(v).replace("R$", "").trim()}
        />
        <Tooltip
          formatter={(value, name) => [
            formatCurrency(Number(value) || 0),
            name === "revenue" ? "Receita" : "Lucro",
          ]}
          labelStyle={{ color: "#0b0b0b", fontWeight: 600 }}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            boxShadow: "0 8px 24px rgba(16,24,40,0.08)",
          }}
        />
        <Legend
          formatter={(value) => (value === "revenue" ? "Receita" : "Lucro")}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Area type="monotone" dataKey="revenue" stroke="none" fill="url(#revenueFill)" isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke={COLORS.revenue}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="profit"
          stroke={COLORS.profit}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
