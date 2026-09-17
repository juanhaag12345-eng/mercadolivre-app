import { PackageSearch } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StockItemRow } from "@/components/compras/StockItemRow";
import { NewStockItemForm } from "@/components/compras/NewStockItemForm";
import type { StockItemAnalytics, StockItemRow as StockItemRowData } from "@/actions/stock";

export function StockItemsList({
  items,
  analytics,
}: {
  items: StockItemRowData[];
  analytics: Record<string, StockItemAnalytics>;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3 bg-surface-muted/60">
        <div>
          <p className="text-sm font-semibold">Produtos cadastrados</p>
          <p className="text-xs text-muted mt-0.5">Clique na seta pra ver o histórico de preços de cada item.</p>
        </div>
        <NewStockItemForm />
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-muted">
            <PackageSearch size={18} />
          </span>
          <p className="text-sm font-semibold">Nenhum item cadastrado</p>
          <p className="text-xs text-muted max-w-sm">
            Clique em &ldquo;Novo item&rdquo; para cadastrar o primeiro produto controlado por estoque.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="px-2 py-2.5"></th>
                <th className="px-2 py-2.5 font-medium">Código</th>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 font-medium">Estoque mín.</th>
                <th className="px-4 py-2.5 font-medium">Estoque atual</th>
                <th className="px-4 py-2.5 font-medium">Custo</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <StockItemRow key={item.id} item={item} analytics={analytics[item.id]} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
