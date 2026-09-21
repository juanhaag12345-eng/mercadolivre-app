import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getStockAnalytics, listStockItemsWithStock } from "@/actions/stock";
import { StockItemsList } from "@/components/compras/StockItemsList";

export const dynamic = "force-dynamic";

// Cadastro completo dos produtos físicos controlados por estoque: nome,
// EAN, estoque mínimo, tipo de venda (unitário/display/conjunto/caixa) e
// preço de custo de referência. É o mesmo cadastro usado para dar baixa em
// vendas do Mercado Livre (/pendentes) e pra ligar compras (/compras) —
// só ganhou uma aba própria em vez de ficar embutido dentro de Compras.
export default async function CadastroProdutosPage() {
  const [items, analytics] = await Promise.all([listStockItemsWithStock(), getStockAnalytics()]);

  const lowStockItems = items.filter((item) => item.active && item.lowStock);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto animate-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Controle de Estoque</h1>
        <p className="text-sm text-muted mt-0.5">
          Cadastre, visualize, edite e exclua os produtos controlados por estoque, e ajuste manualmente a quantidade
          quando a contagem física não bater com o calculado — usados tanto nas compras quanto para dar baixa em
          vendas do Mercado Livre confirmadas em Pendentes.
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

      <StockItemsList items={items} analytics={analytics} />
    </div>
  );
}
