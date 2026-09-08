"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { CheckCheck, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IntegerInput, Label, MoneyInput, Select } from "@/components/ui/Field";
import { confirmPendingSale, ignorePendingSale } from "@/actions/mercadolivre";
import { formatCurrency, formatDate, formatPercent, formatTime } from "@/lib/format";
import { DISPATCHER_LABELS, DISPATCHERS, type PendingSale } from "@/db/schema";
import type { ActionResult } from "@/actions/products";

function toDateInputValue(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

export function PendingSaleCard({ pending }: { pending: PendingSale }) {
  const confirmAction = confirmPendingSale.bind(null, pending.id);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(confirmAction, null);
  const errors = state && !state.ok ? state.errors : {};

  const [quantity, setQuantity] = useState(pending.quantity);
  const [productCost, setProductCost] = useState(0);
  const [ignoring, startIgnoreTransition] = useTransition();

  const orderDateObj = new Date(pending.orderDate);
  const unitPrice = Number(pending.unitPriceSnapshot);
  const totalValue = unitPrice * quantity;
  const mlSaleFee = pending.mlSaleFeeSnapshot !== null ? Number(pending.mlSaleFeeSnapshot) : null;
  const mlShippingCost = pending.mlShippingCostSnapshot !== null ? Number(pending.mlShippingCostSnapshot) : null;
  const saleFeePercent = mlSaleFee !== null && totalValue > 0 ? (mlSaleFee / totalValue) * 100 : null;
  const customerName = pending.buyerFullName || pending.buyerNickname;

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{pending.titleSnapshot}</p>
          <p className="text-xs text-muted mt-0.5">
            Pedido ML #{pending.mlOrderId}
            {pending.mlPackId && pending.mlPackId !== pending.mlOrderId
              ? ` (venda #${pending.mlPackId} na Central de Vendedores)`
              : ""}{" "}
            · {formatDate(orderDateObj)} às {formatTime(orderDateObj)}
          </p>
          <p className="text-xs text-muted mt-0.5">
            Cliente: <span className="font-medium text-foreground">{customerName ?? "não informado"}</span>
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent whitespace-nowrap">
          {pending.quantity}x {formatCurrency(unitPrice)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-muted">
          Valor total da venda: <span className="font-semibold text-foreground">{formatCurrency(totalValue)}</span>
        </span>
        {quantity >= 2 && (
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-muted">
            Valor unitário: <span className="font-semibold text-foreground">{formatCurrency(unitPrice)}</span>
          </span>
        )}
        {mlSaleFee !== null && (
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-muted">
            Tarifa de venda: <span className="font-semibold text-foreground">{formatCurrency(mlSaleFee)}</span>
            {saleFeePercent !== null && <span> ({formatPercent(saleFeePercent)})</span>}
          </span>
        )}
        {mlShippingCost !== null && (
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-muted">
            Tarifa de envio: <span className="font-semibold text-foreground">{formatCurrency(mlShippingCost)}</span>
          </span>
        )}
      </div>

      <form action={formAction} className="space-y-3 border-t border-border pt-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label hint="conforme o anúncio — kit conta como 1 unidade vendida">Quantidade vendida</Label>
            <IntegerInput name="quantity" min={1} value={quantity} onValueChange={setQuantity} error={errors.quantity} />
          </div>
          <div>
            <Label hint="quem executou a venda">Quem despachou?</Label>
            <Select name="dispatchedBy" defaultValue="" error={errors.dispatchedBy} required>
              <option value="" disabled>
                Selecione...
              </option>
              {DISPATCHERS.map((dispatcher) => (
                <option key={dispatcher} value={dispatcher}>
                  {DISPATCHER_LABELS[dispatcher]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label hint="custo total com mercadoria dessa venda (não é por unidade)">Custo do produto</Label>
          <MoneyInput
            name="productCostManual"
            value={productCost}
            onValueChange={setProductCost}
            error={errors.productCostManual}
          />
        </div>

        <input type="hidden" name="saleDate" value={toDateInputValue(orderDateObj)} />

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <div className="flex items-center gap-2 pt-1">
          <ConfirmButton />
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={ignoring}
            onClick={() => startIgnoreTransition(() => ignorePendingSale(pending.id))}
          >
            {ignoring ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
            Ignorar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="md" disabled={pending}>
      {pending ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
      Confirmar entrada
    </Button>
  );
}
