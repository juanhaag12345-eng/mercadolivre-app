"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { CheckCheck, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IntegerInput, Label, Select } from "@/components/ui/Field";
import { confirmPendingSale, ignorePendingSale } from "@/actions/mercadolivre";
import { formatCurrency, formatDate } from "@/lib/format";
import { suggestProducts } from "@/lib/product-matching";
import { DISPATCHER_LABELS, DISPATCHERS, type PendingSale, type Product } from "@/db/schema";
import type { ActionResult } from "@/actions/products";

function toDateInputValue(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

export function PendingSaleCard({ pending, products }: { pending: PendingSale; products: Product[] }) {
  const confirmAction = confirmPendingSale.bind(null, pending.id);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(confirmAction, null);
  const errors = state && !state.ok ? state.errors : {};

  const [quantity, setQuantity] = useState(pending.quantity);
  const [ignoring, startIgnoreTransition] = useTransition();

  const orderedProducts = suggestProducts(pending.titleSnapshot, products);
  const unitPrice = Number(pending.unitPriceSnapshot);

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{pending.titleSnapshot}</p>
          <p className="text-xs text-muted mt-0.5">
            Pedido ML #{pending.mlOrderId} · {formatDate(new Date(pending.orderDate))}
            {pending.buyerNickname ? ` · comprador ${pending.buyerNickname}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent whitespace-nowrap">
          {pending.quantity}x {formatCurrency(unitPrice)}
        </span>
      </div>

      <form action={formAction} className="space-y-3 border-t border-border pt-3">
        <div>
          <Label>Produto correspondente</Label>
          <Select name="productId" defaultValue="" error={errors.productId} required>
            <option value="" disabled>
              Selecione o produto cadastrado...
            </option>
            {orderedProducts.map((product) => (
              <option key={product.id} value={product.id}>
                #{product.internalCode} {product.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Quantidade</Label>
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

        <input type="hidden" name="saleDate" value={toDateInputValue(new Date(pending.orderDate))} />

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
