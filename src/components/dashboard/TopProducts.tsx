import { Trophy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrency, formatPercent } from "@/lib/format";

export interface TopProductRow {
  name: string;
  revenue: number;
  profit: number;
  quantity: number;
  shippingTotal: number;
}

export function TopProducts({ rows }: { rows: TopProductRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={16} className="text-muted" />
        <h2 className="font-semibold">Mais vendidos no período</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">Nenhuma venda no período.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={row.name}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium truncate flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-muted text-[11px] font-bold text-muted">
                    {i + 1}
                  </span>
                  {row.name}
                </span>
                <span className="font-semibold whitespace-nowrap ml-2">{formatCurrency(row.revenue)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(row.revenue / max) * 100}%`, background: "#2a78d6" }}
                />
              </div>
              <p className="text-xs text-muted mt-1">
                {row.quantity} {row.quantity === 1 ? "venda" : "vendas"} · lucro {formatCurrency(row.profit)} · frete{" "}
                {formatCurrency(row.shippingTotal)} ({formatPercent(row.revenue > 0 ? (row.shippingTotal / row.revenue) * 100 : 0, 1)})
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
