import { PackageSearch } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SaleStatusSelect, DeleteSaleButton } from "@/components/sales/SaleRowActions";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import type { SaleWithFinancials } from "@/lib/sale-financials";

export function SalesTable({ sales }: { sales: SaleWithFinancials[] }) {
  if (sales.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-14 text-center">
        <PackageSearch size={36} className="text-muted mb-3" />
        <p className="font-semibold">Nenhuma venda encontrada</p>
        <p className="text-sm text-muted mt-1">Ajuste os filtros ou registre uma nova venda.</p>
      </Card>
    );
  }

  const totals = sales.reduce(
    (acc, s) => {
      acc.revenue += s.revenue;
      acc.profit += s.profit;
      return acc;
    },
    { revenue: 0, profit: 0 }
  );

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3 bg-surface-muted/60">
        <p className="text-sm font-semibold">{sales.length} vendas</p>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted">
            Receita: <strong className="text-foreground">{formatCurrency(totals.revenue)}</strong>
          </span>
          <span className="text-muted">
            Lucro: <strong className="text-success">{formatCurrency(totals.profit)}</strong>
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="px-5 py-2.5 font-medium">Produto</th>
              <th className="px-3 py-2.5 font-medium">Data</th>
              <th className="px-3 py-2.5 font-medium">Qtd</th>
              <th className="px-3 py-2.5 font-medium">Receita</th>
              <th className="px-3 py-2.5 font-medium">Lucro</th>
              <th className="px-3 py-2.5 font-medium">Margem</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id} className="border-b border-border last:border-0 hover:bg-surface-muted/40">
                <td className="px-5 py-3 font-medium max-w-[220px] truncate">{sale.productNameSnapshot}</td>
                <td className="px-3 py-3 text-muted whitespace-nowrap">{formatDate(sale.saleDate)}</td>
                <td className="px-3 py-3 text-muted">{sale.quantity}</td>
                <td className="px-3 py-3 whitespace-nowrap">{formatCurrency(sale.revenue)}</td>
                <td
                  className={`px-3 py-3 font-semibold whitespace-nowrap ${
                    sale.profit >= 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {formatCurrency(sale.profit)}
                </td>
                <td className="px-3 py-3 text-muted whitespace-nowrap">{formatPercent(sale.marginPercent)}</td>
                <td className="px-3 py-3">
                  <SaleStatusSelect saleId={sale.id} status={sale.orderStatus} />
                </td>
                <td className="px-3 py-3">
                  <DeleteSaleButton saleId={sale.id} productName={sale.productNameSnapshot} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
