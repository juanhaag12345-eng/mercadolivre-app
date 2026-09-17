import { History, Sparkles } from "lucide-react";
import { Card, Badge } from "@/components/ui/Card";
import { DeletePurchaseButton } from "@/components/compras/DeletePurchaseButton";
import { MarkPaymentStatusButton } from "@/components/compras/MarkPaymentStatusButton";
import { PurchaseFilterTabs } from "@/components/compras/PurchaseFilterTabs";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PURCHASE_ORIGIN_LABELS, type PaymentMethod } from "@/db/schema";
import type { PurchaseFilter, PurchaseRow } from "@/actions/stock";

export function PurchaseHistory({
  purchases,
  filtro,
}: {
  purchases: PurchaseRow[];
  filtro: PurchaseFilter;
}) {
  const today = todayISO();

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-3 bg-surface-muted/60">
        <div className="flex items-center gap-2">
          <History size={16} className="text-muted" />
          <p className="text-sm font-semibold">Compras</p>
        </div>
        <PurchaseFilterTabs current={filtro} />
      </div>

      {purchases.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">Nenhuma compra encontrada com esse filtro.</p>
      ) : (
        <div className="divide-y divide-border">
          {purchases.map((purchase) => {
            const overdue = purchase.paymentStatus === "pendente" && !!purchase.dueDate && purchase.dueDate < today;
            return (
              <div key={purchase.id} className="flex flex-col gap-2 px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
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

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={purchase.origem === "nf" ? "accent" : "neutral"}>
                    {PURCHASE_ORIGIN_LABELS[purchase.origem]}
                    {purchase.notaFiscalNumero ? ` · nº ${purchase.notaFiscalNumero}` : ""}
                  </Badge>
                  {purchase.produtoNovo && (
                    <Badge tone="accent">
                      <Sparkles size={11} className="mr-1 -ml-0.5" />
                      PRODUTO NOVO
                    </Badge>
                  )}
                  <Badge tone={overdue ? "danger" : purchase.paymentStatus === "pago" ? "success" : "warning"}>
                    {overdue ? "Atrasado" : purchase.paymentStatus === "pago" ? "Pago" : "Pendente"}
                    {purchase.dueDate ? ` · vence ${formatDate(purchase.dueDate)}` : ""}
                  </Badge>
                  <MarkPaymentStatusButton purchaseId={purchase.id} currentStatus={purchase.paymentStatus} />
                </div>

                {purchase.observacao && <p className="text-xs text-muted italic">{purchase.observacao}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
