import { History } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DeletePurchaseButton } from "@/components/compras/DeletePurchaseButton";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/db/schema";
import type { PurchaseRow } from "@/actions/stock";

export function PurchaseHistory({ purchases }: { purchases: PurchaseRow[] }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3 bg-surface-muted/60">
        <History size={16} className="text-muted" />
        <p className="text-sm font-semibold">Compras recentes</p>
      </div>

      {purchases.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">Nenhuma compra registrada ainda.</p>
      ) : (
        <div className="divide-y divide-border">
          {purchases.map((purchase) => (
            <div key={purchase.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  <span className="text-muted font-mono">#{purchase.itemInternalCode}</span> {purchase.itemName}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {formatDate(purchase.purchaseDate)} · {purchase.supplier} ·{" "}
                  {PAYMENT_METHOD_LABELS[purchase.paymentMethod as PaymentMethod] ?? purchase.paymentMethod}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(purchase.totalCost)}</p>
                  <p className="text-xs text-muted">
                    {purchase.quantity}x {formatCurrency(purchase.unitCost)}
                  </p>
                </div>
                <DeletePurchaseButton purchaseId={purchase.id} itemName={purchase.itemName} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
