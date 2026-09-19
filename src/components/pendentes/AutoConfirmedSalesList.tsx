"use client";

import { useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { setDispatchedByForAutoConfirmedSale, type AutoConfirmedSaleRow } from "@/actions/mercadolivre";
import { DISPATCHER_LABELS, DISPATCHERS, type Dispatcher } from "@/db/schema";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * Lista as últimas vendas que o sistema confirmou sozinho (anúncio já
 * mapeado a um produto — ver AdTitleMappingsPanel) pra conferência: qual
 * produto foi usado, custo aplicado e — quando ainda não escolhido de
 * verdade — quem despacha, já que isso não dá pra saber sozinho.
 */
export function AutoConfirmedSalesList({
  sales,
  accountLabelByMlUserId,
}: {
  sales: AutoConfirmedSaleRow[];
  accountLabelByMlUserId: Map<string, string>;
}) {
  if (sales.length === 0) return null;

  return (
    <Card className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Sparkles size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold">Confirmadas automaticamente</p>
          <p className="text-xs text-muted">
            Entraram sozinhas no dashboard porque o anúncio já tinha um produto vinculado. Confira e, se faltar, diga
            quem despachou.
          </p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {sales.map((sale) => (
          <AutoConfirmedSaleRowItem
            key={sale.id}
            sale={sale}
            accountLabel={sale.mlSellerId ? accountLabelByMlUserId.get(sale.mlSellerId) ?? null : null}
          />
        ))}
      </div>
    </Card>
  );
}

function AutoConfirmedSaleRowItem({
  sale,
  accountLabel,
}: {
  sale: AutoConfirmedSaleRow;
  accountLabel: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{sale.productNameSnapshot}</p>
        <p className="text-xs text-muted mt-0.5">
          {sale.stockItemName ? (
            <>
              produto: <span className="font-medium text-foreground">#{sale.stockItemInternalCode} {sale.stockItemName}</span>
              {" · "}
            </>
          ) : null}
          {formatDate(sale.saleDate)}
          {accountLabel ? ` · ${accountLabel}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="text-sm font-semibold">{formatCurrency(sale.revenue)}</p>
          <p className={`text-xs ${sale.profit >= 0 ? "text-success" : "text-danger"}`}>lucro {formatCurrency(sale.profit)}</p>
        </div>
        {sale.dispatchedByConfirmed ? (
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted whitespace-nowrap">
            {DISPATCHER_LABELS[sale.dispatchedBy]}
          </span>
        ) : (
          <div className="relative inline-flex items-center">
            <select
              defaultValue=""
              disabled={isPending}
              onChange={(e) => {
                const value = e.target.value as Dispatcher;
                if (!value) return;
                startTransition(() => setDispatchedByForAutoConfirmedSale(sale.id, value));
              }}
              className="h-8 rounded-full border-0 bg-warning-soft pl-3 pr-7 text-xs font-semibold text-warning focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="" disabled>
                Quem despachou?
              </option>
              {DISPATCHERS.map((dispatcher) => (
                <option key={dispatcher} value={dispatcher}>
                  {DISPATCHER_LABELS[dispatcher]}
                </option>
              ))}
            </select>
            {isPending && <Loader2 size={12} className="animate-spin absolute right-2" />}
          </div>
        )}
      </div>
    </div>
  );
}
