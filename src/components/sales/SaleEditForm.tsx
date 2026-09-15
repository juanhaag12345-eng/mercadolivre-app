"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, IntegerInput, Label, MoneyInput, PercentInput, Select, Textarea } from "@/components/ui/Field";
import { DeleteSaleButton } from "@/components/sales/SaleRowActions";
import { updateSale } from "@/actions/sales";
import { calculateFinancials, toNumber } from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";
import { DISPATCHER_LABELS, DISPATCHERS, ORDER_STATUSES, type SaleFeeType } from "@/db/schema";
import type { SaleWithFinancials } from "@/lib/sale-financials";
import type { ActionResult } from "@/actions/products";

export function SaleEditForm({ sale }: { sale: SaleWithFinancials }) {
  const action = updateSale.bind(null, sale.id);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(action, null);
  const errors = state && !state.ok ? state.errors : {};

  const isMl = sale.source === "mercadolivre";

  const [quantity, setQuantity] = useState(sale.quantity);

  // --- venda manual: os próprios valores financeiros são editáveis ---
  const [unitPrice, setUnitPrice] = useState(toNumber(sale.unitPriceSnapshot));
  const [saleFeeType, setSaleFeeType] = useState<SaleFeeType>(sale.saleFeeTypeSnapshot);
  const [saleFeeValue, setSaleFeeValue] = useState(toNumber(sale.saleFeeValueSnapshot));
  const [shippingCost, setShippingCost] = useState(toNumber(sale.shippingCostSnapshot));
  const [packagingCost, setPackagingCost] = useState(toNumber(sale.packagingCostSnapshot));
  const [productCost, setProductCost] = useState(toNumber(sale.productCostSnapshot));

  // --- venda do Mercado Livre: só o custo do produto é editável ---
  const [productCostManual, setProductCostManual] = useState(toNumber(sale.productCostManualSnapshot));

  const manualBreakdown = calculateFinancials({
    unitPrice,
    kitQuantity: sale.kitQuantitySnapshot,
    saleFeeType,
    saleFeeValue,
    shippingCost,
    packagingCost,
    productCost,
    quantity,
  });

  const mlRevenue = toNumber(sale.unitPriceSnapshot) * quantity;
  const mlSaleFee = toNumber(sale.mlSaleFeeTotalSnapshot);
  const mlShipping = toNumber(sale.mlShippingTotalSnapshot);
  const mlProfit = mlRevenue - mlSaleFee - mlShipping - productCostManual;
  const mlMargin = mlRevenue > 0 ? (mlProfit / mlRevenue) * 100 : 0;

  const revenue = isMl ? mlRevenue : manualBreakdown.revenue;
  const profit = isMl ? mlProfit : manualBreakdown.profit;
  const marginPercent = isMl ? mlMargin : manualBreakdown.marginPercent;

  return (
    <form action={formAction} className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-6">
        <Card>
          <h2 className="font-semibold mb-4">Dados da venda</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data da venda</Label>
              <Input type="date" name="saleDate" defaultValue={sale.saleDate} error={errors.saleDate} required />
            </div>
            <div>
              <Label>Quantidade vendida</Label>
              <IntegerInput name="quantity" min={1} value={quantity} onValueChange={setQuantity} error={errors.quantity} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <Label>Status do pedido</Label>
              <Select name="orderStatus" defaultValue={sale.orderStatus} error={errors.orderStatus}>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status === "pendente" ? "Pendente" : "Despachado"}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label hint="quem executou a venda">Quem despachou?</Label>
              <Select name="dispatchedBy" defaultValue={sale.dispatchedBy} error={errors.dispatchedBy} required>
                {DISPATCHERS.map((dispatcher) => (
                  <option key={dispatcher} value={dispatcher}>
                    {DISPATCHER_LABELS[dispatcher]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-4">
            <Label hint="opcional">Observações</Label>
            <Textarea name="notes" rows={2} defaultValue={sale.notes ?? ""} />
          </div>
        </Card>

        {isMl ? (
          <Card>
            <h2 className="font-semibold mb-1">Valores do Mercado Livre</h2>
            <p className="text-xs text-muted mb-4">
              Receita, tarifa de venda e frete são valores reais vindos do pedido — não são editáveis aqui. Só o
              custo do produto pode ser corrigido.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
              <div>
                <p className="text-xs text-muted">Receita</p>
                <p className="font-semibold">{formatCurrency(mlRevenue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Tarifa de venda</p>
                <p className="font-semibold">{formatCurrency(mlSaleFee)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Frete</p>
                <p className="font-semibold">{formatCurrency(mlShipping)}</p>
              </div>
            </div>
            <div className="max-w-[220px]">
              <Label hint="custo total dessa venda, não por unidade">Custo do produto</Label>
              <MoneyInput
                name="productCostManual"
                value={productCostManual}
                onValueChange={setProductCostManual}
                error={errors.productCostManual}
              />
            </div>
          </Card>
        ) : (
          <>
            <Card>
              <h2 className="font-semibold mb-4">Preço e taxa de venda</h2>
              <div className="grid grid-cols-2 gap-4 max-w-[460px]">
                <div>
                  <Label hint="por unidade">Valor de venda</Label>
                  <MoneyInput
                    name="unitPriceSnapshot"
                    value={unitPrice}
                    onValueChange={setUnitPrice}
                    error={errors.unitPriceSnapshot}
                  />
                </div>
                <div />
                <div>
                  <Label>Tipo de taxa</Label>
                  <Select
                    name="saleFeeType"
                    value={saleFeeType}
                    onChange={(e) => setSaleFeeType(e.target.value as SaleFeeType)}
                  >
                    <option value="percentual">Percentual (%)</option>
                    <option value="fixo">Valor fixo (R$)</option>
                  </Select>
                </div>
                <div>
                  <Label>{saleFeeType === "percentual" ? "Percentual" : "Valor"}</Label>
                  {saleFeeType === "percentual" ? (
                    <PercentInput
                      name="saleFeeValue"
                      value={saleFeeValue}
                      onValueChange={setSaleFeeValue}
                      error={errors.saleFeeValue}
                    />
                  ) : (
                    <MoneyInput
                      name="saleFeeValue"
                      value={saleFeeValue}
                      onValueChange={setSaleFeeValue}
                      error={errors.saleFeeValue}
                    />
                  )}
                </div>
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold mb-4">Frete e custos</h2>
              <div className="grid grid-cols-2 gap-4 max-w-[460px]">
                <div>
                  <Label>Custo de envio</Label>
                  <MoneyInput
                    name="shippingCost"
                    value={shippingCost}
                    onValueChange={setShippingCost}
                    error={errors.shippingCost}
                  />
                </div>
                <div>
                  <Label>Custo da embalagem</Label>
                  <MoneyInput
                    name="packagingCost"
                    value={packagingCost}
                    onValueChange={setPackagingCost}
                    error={errors.packagingCost}
                  />
                </div>
                <div>
                  <Label hint="por unidade">Custo do produto</Label>
                  <MoneyInput
                    name="productCost"
                    value={productCost}
                    onValueChange={setProductCost}
                    error={errors.productCost}
                  />
                </div>
              </div>
            </Card>
          </>
        )}

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <div className="flex items-center gap-3">
          <SubmitButton />
          <DeleteSaleButton saleId={sale.id} productName={sale.productNameSnapshot} />
        </div>
      </div>

      <div className="lg:sticky lg:top-6 h-fit space-y-4">
        <Card className="bg-foreground text-white border-0">
          <p className="text-xs uppercase tracking-wide text-white/60 mb-1">Prévia</p>
          <p className="text-3xl font-bold mb-4">{formatCurrency(profit)}</p>
          <div className="space-y-2 text-sm">
            <Row label="Receita" value={formatCurrency(revenue)} />
            <Row label="Lucro" value={formatCurrency(profit)} strong />
            <Row label="Margem" value={formatPercent(marginPercent)} />
          </div>
        </Card>

        <Card className="space-y-2 text-sm">
          <h2 className="font-semibold mb-1">Origem</h2>
          <p className="text-muted">{isMl ? "Mercado Livre" : "Cadastro manual"}</p>
          {sale.mlOrderId && (
            <p className="text-xs text-muted">
              Pedido ML #{sale.mlOrderId}
              {sale.mlPackId && sale.mlPackId !== sale.mlOrderId ? ` (venda #${sale.mlPackId})` : ""}
            </p>
          )}
          {(sale.buyerFullName || sale.buyerNickname) && (
            <p className="text-xs text-muted">Cliente: {sale.buyerFullName ?? sale.buyerNickname}</p>
          )}
        </Card>
      </div>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "text-white/85" : "text-white/60"}>{label}</span>
      <span className={strong ? "font-bold text-base" : ""}>{value}</span>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="lg" disabled={pending}>
      {pending && <Loader2 size={16} className="animate-spin" />}
      Salvar alterações
    </Button>
  );
}
