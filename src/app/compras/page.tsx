import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { listStockItemsWithStock, listPurchases } from "@/actions/stock";
import { StockItemsList } from "@/components/compras/StockItemsList";
import { PurchaseForm } from "@/components/compras/PurchaseForm";
import { PurchaseHistory } from "@/components/compras/PurchaseHistory";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  const [items, purchases] = await Promise.all([listStockItemsWithStock(), listPurchases()]);

  const lowStockItems = items.filter((item) => item.active && item.lowStock);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto animate-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Compras e estoque</h1>
        <p className="text-sm text-muted mt-0.5">
          Registre as compras de mercadoria para controlar o estoque — ligado às vendas confirmadas em Pendentes.
        </p>
      </div>

      {lowStockItems.length > 0 && (
        <Card className="mb-6 border-danger/30 bg-danger-soft/40">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
              <AlertTriangle size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-danger">
                {lowStockItems.length} item{lowStockItems.length === 1 ? "" : "s"} com estoque baixo — hora de comprar
              </p>
              <p className="text-xs text-muted mt-1">
                {lowStockItems.map((item) => `#${item.internalCode} ${item.name} (${item.currentStock} un.)`).join(" · ")}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <PurchaseForm stockItems={items.filter((i) => i.active)} />
        <PurchaseHistory purchases={purchases} />
      </div>

      <StockItemsList items={items} />
    </div>
  );
}
