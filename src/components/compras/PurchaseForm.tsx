"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, ShoppingCart } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, IntegerInput, Label, MoneyInput, Select, Textarea } from "@/components/ui/Field";
import { createPurchase } from "@/actions/stock";
import { todayISO } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/db/schema";
import type { StockItemRow } from "@/actions/stock";
import type { ActionResult } from "@/actions/products";

export function PurchaseForm({ stockItems }: { stockItems: StockItemRow[] }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(createPurchase, null);
  const errors = state && !state.ok ? state.errors : {};

  const [stockItemId, setStockItemId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [unitCost, setUnitCost] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [paymentTermDays, setPaymentTermDays] = useState(0);
  const [observacao, setObservacao] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  // Reseta o formulário quando o registro der certo — comparar com o
  // último `state` já tratado (em vez de um useEffect) evita um re-render
  // extra. O sumiço automático do aviso de sucesso, alguns segundos depois,
  // esse sim é um efeito de verdade (mexe com um timer).
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) {
      setStockItemId("");
      setSupplier("");
      setUnitCost(0);
      setQuantity(1);
      setPaymentMethod("");
      setPaymentTermDays(0);
      setObservacao("");
      setShowSuccess(true);
    }
  }

  useEffect(() => {
    if (!showSuccess) return;
    const timeout = setTimeout(() => setShowSuccess(false), 3000);
    return () => clearTimeout(timeout);
  }, [showSuccess]);

  if (stockItems.length === 0) {
    return (
      <Card className="text-sm text-muted">
        Cadastre um item de estoque acima antes de registrar uma compra.
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <ShoppingCart size={16} className="text-muted" />
        <h2 className="font-semibold">Nova compra sem NF</h2>
      </div>
      <p className="text-xs text-muted mb-4">
        Para compras com nota fiscal, aprove a NF-e recebida por e-mail em Notas Fiscais — ela entra
        automaticamente aqui no histórico, marcada como &ldquo;Com NF&rdquo;.
      </p>

      {showSuccess && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 size={16} />
          <span>Compra registrada com sucesso.</span>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <Label>Item comprado</Label>
          <Select
            name="stockItemId"
            value={stockItemId}
            onChange={(e) => setStockItemId(e.target.value)}
            error={errors.stockItemId}
            required
          >
            <option value="" disabled>
              Selecione...
            </option>
            {stockItems.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.internalCode} {item.name} (estoque atual: {item.currentStock})
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Data da compra</Label>
            <Input type="date" name="purchaseDate" defaultValue={todayISO()} error={errors.purchaseDate} required />
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Input name="supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} error={errors.supplier} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label hint="sempre por unidade">Preço de custo</Label>
            <MoneyInput name="unitCost" value={unitCost} onValueChange={setUnitCost} error={errors.unitCost} />
          </div>
          <div>
            <Label>Quantidade comprada</Label>
            <IntegerInput name="quantity" min={1} value={quantity} onValueChange={setQuantity} error={errors.quantity} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Forma de pagamento</Label>
            <Select
              name="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              error={errors.paymentMethod}
              required
            >
              <option value="" disabled>
                Selecione...
              </option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label hint="0 = à vista">Prazo de pagamento (dias)</Label>
            <IntegerInput
              name="paymentTermDays"
              min={0}
              value={paymentTermDays}
              onValueChange={setPaymentTermDays}
              error={errors.paymentTermDays}
            />
          </div>
        </div>

        <div>
          <Label hint="opcional">Observação</Label>
          <Textarea
            name="observacao"
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            error={errors.observacao}
          />
        </div>

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <SubmitButton />
      </form>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="lg" disabled={pending}>
      {pending && <Loader2 size={16} className="animate-spin" />}
      Registrar compra
    </Button>
  );
}
