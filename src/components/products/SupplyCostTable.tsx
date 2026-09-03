import { PackageSearch } from "lucide-react";
import { Card, Badge } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import type { SupplyCostRow } from "@/actions/supply-cost";

export function SupplyCostTable({ rows }: { rows: SupplyCostRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-14 text-center">
        <PackageSearch size={36} className="text-muted mb-3" />
        <p className="font-semibold">Nenhum produto encontrado</p>
        <p className="text-sm text-muted mt-1">Tente buscar por outro nome.</p>
      </Card>
    );
  }

  const totalSpent = rows.reduce((sum, r) => sum + r.totalSpent, 0);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3 bg-surface-muted/60">
        <p className="text-sm font-semibold">{rows.length} produtos</p>
        <span className="text-sm text-muted">
          Gasto nesses produtos: <strong className="text-foreground">{formatCurrency(totalSpent)}</strong>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="px-5 py-2.5 font-medium">Produto</th>
              <th className="px-3 py-2.5 font-medium">Custo por unidade</th>
              <th className="px-3 py-2.5 font-medium">Unidades vendidas</th>
              <th className="px-3 py-2.5 font-medium">Gasto até agora</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-muted/40">
                <td className="px-5 py-3 font-medium max-w-[260px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted shrink-0">#{row.internalCode}</span>
                    <span className="truncate">{row.name}</span>
                    {row.isKit && (
                      <Badge tone="accent" className="shrink-0">
                        Kit x{row.kitQuantity}
                      </Badge>
                    )}
                    {!row.active && (
                      <Badge tone="neutral" className="shrink-0">
                        Inativo
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{formatCurrency(row.unitCost)}</td>
                <td className="px-3 py-3 text-muted whitespace-nowrap">{row.unitsSold}</td>
                <td className="px-3 py-3 font-semibold whitespace-nowrap">{formatCurrency(row.totalSpent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
