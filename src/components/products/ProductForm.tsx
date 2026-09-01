"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Info, Loader2, Package } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input, Label, MoneyInput, PercentInput, Select, Toggle } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { calculateFinancials, toNumber } from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { Product } from "@/db/schema";
import type { ActionResult } from "@/actions/products";

type Action = (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function ProductForm({
  product,
  action,
  deleteSlot,
}: {
  product?: Product;
  action: Action;
  deleteSlot?: ReactNode;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(action, null);
  const errors = state && !state.ok ? state.errors : {};

  const [isKit, setIsKit] = useState(product?.isKit ?? false);
  const [kitQuantity, setKitQuantity] = useState(product?.kitQuantity ?? 1);
  const [unitPrice, setUnitPrice] = useState(toNumber(product?.unitPrice) || 0);
  const [saleFeeType, setSaleFeeType] = useState<"percentual" | "fixo">(
    product?.saleFeeType ?? "percentual"
  );
  const [saleFeeValue, setSaleFeeValue] = useState(toNumber(product?.saleFeeValue) || 0);
  const [freeShipping, setFreeShipping] = useState(product?.freeShipping ?? false);
  const [shippingCost, setShippingCost] = useState(toNumber(product?.shippingCost) || 0);
  const [packagingCost, setPackagingCost] = useState(toNumber(product?.packagingCost) || 0);
  const [productCost, setProductCost] = useState(toNumber(product?.productCost) || 0);
  const [active, setActive] = useState(product?.active ?? true);

  const breakdown = useMemo(
    () =>
      calculateFinancials({
        unitPrice,
        kitQuantity: isKit ? kitQuantity : 1,
        saleFeeType,
        saleFeeValue,
        shippingCost,
        packagingCost,
        productCost,
      }),
    [unitPrice, isKit, kitQuantity, saleFeeType, saleFeeValue, shippingCost, packagingCost, productCost]
  );

  const marginTone =
    breakdown.marginPercent >= 20 ? "success" : breakdown.marginPercent >= 0 ? "warning" : "danger";

  return (
    <form action={formAction} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
      <div className="space-y-6">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Package size={18} className="text-muted" />
            <h2 className="font-semibold">Informações do produto</h2>
          </div>
          <div className="space-y-4">
            <div>
              <Label>Nome do produto</Label>
              <Input
                name="name"
                placeholder='Ex: Nutella 650g ou "Kit com 3 unidades de Nutella 650g"'
                defaultValue={product?.name}
                error={errors.name}
                required
              />
            </div>
            <div>
              <Label hint="opcional">URL da imagem</Label>
              <Input
                name="imageUrl"
                placeholder="https://..."
                defaultValue={product?.imageUrl ?? ""}
                error={errors.imageUrl}
              />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Kit de produtos</h2>
          </div>
          <Toggle
            checked={isKit}
            onChange={setIsKit}
            label="Esse anúncio é um kit com várias unidades"
            description='Ex: "Kit com 3 unidades de Nutella 650g"'
          />
          <input type="hidden" name="isKit" value={isKit ? "on" : "off"} />
          {isKit && (
            <div className="mt-4 max-w-[200px]">
              <Label>Quantas unidades tem o kit?</Label>
              <Input
                name="kitQuantity"
                type="number"
                min={1}
                step={1}
                value={kitQuantity}
                onChange={(e) => setKitQuantity(Number(e.target.value) || 1)}
                error={errors.kitQuantity}
              />
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold mb-4">Preço de venda</h2>
          <div className="max-w-[220px]">
            <Label hint={isKit ? "valor de 1 unidade" : undefined}>Valor de venda (por unidade)</Label>
            <MoneyInput
              name="unitPrice"
              value={unitPrice}
              onValueChange={setUnitPrice}
              error={errors.unitPrice}
              required
            />
            {isKit && (
              <p className="mt-1.5 text-xs text-muted">
                Total do kit: <strong>{formatCurrency(unitPrice * kitQuantity)}</strong>
              </p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold mb-4">Taxa de venda do Mercado Livre</h2>
          <div className="grid grid-cols-2 gap-4 max-w-[420px]">
            <div>
              <Label>Tipo</Label>
              <Select
                name="saleFeeType"
                value={saleFeeType}
                onChange={(e) => setSaleFeeType(e.target.value as "percentual" | "fixo")}
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
          <h2 className="font-semibold mb-4">Frete</h2>
          <Toggle
            checked={freeShipping}
            onChange={setFreeShipping}
            label="Frete grátis para o comprador"
            description="O custo do envio é assumido por você e descontado do lucro"
          />
          <input type="hidden" name="freeShipping" value={freeShipping ? "on" : "off"} />
          <div className="mt-4 max-w-[220px]">
            <Label hint="por envio">Custo de envio</Label>
            <MoneyInput
              name="shippingCost"
              value={shippingCost}
              onValueChange={setShippingCost}
              error={errors.shippingCost}
            />
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold mb-4">Custos</h2>
          <div className="grid grid-cols-2 gap-4 max-w-[460px]">
            <div>
              <Label hint="por envio">Custo da embalagem</Label>
              <MoneyInput
                name="packagingCost"
                value={packagingCost}
                onValueChange={setPackagingCost}
                error={errors.packagingCost}
              />
            </div>
            <div>
              <Label hint={isKit ? "por unidade" : undefined}>Custo do produto</Label>
              <MoneyInput
                name="productCost"
                value={productCost}
                onValueChange={setProductCost}
                error={errors.productCost}
              />
            </div>
          </div>
          {isKit && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
              <Info size={14} className="mt-0.5 shrink-0" />
              O custo do produto é por unidade — multiplicamos automaticamente pelas{" "}
              {kitQuantity} unidades do kit.
            </p>
          )}
        </Card>

        <Card>
          <Toggle
            checked={active}
            onChange={setActive}
            label="Produto ativo"
            description="Produtos inativos não aparecem na busca ao registrar uma venda"
          />
          <input type="hidden" name="active" value={active ? "on" : "off"} />
        </Card>

        <div className="flex items-center gap-3">
          <SubmitButton isEdit={!!product} />
          {deleteSlot}
        </div>
      </div>

      <div className="lg:sticky lg:top-6 h-fit">
        <Card className="bg-foreground text-white border-0">
          <p className="text-xs uppercase tracking-wide text-white/60 mb-1">Prévia de lucro</p>
          <p className="text-3xl font-bold mb-4">{formatCurrency(breakdown.profit)}</p>

          <div className="space-y-2 text-sm">
            <Row label="Receita da venda" value={formatCurrency(breakdown.revenue)} />
            <Row label="Taxa de venda" value={`- ${formatCurrency(breakdown.saleFeeAmount)}`} muted />
            <Row label="Envio" value={`- ${formatCurrency(breakdown.shippingTotal)}`} muted />
            <Row label="Embalagem" value={`- ${formatCurrency(breakdown.packagingTotal)}`} muted />
            <Row label="Custo do produto" value={`- ${formatCurrency(breakdown.productCostTotal)}`} muted />
            <div className="h-px bg-white/15 my-2" />
            <Row label="Lucro líquido" value={formatCurrency(breakdown.profit)} strong />
          </div>

          <div
            className="mt-4 rounded-xl px-3 py-2.5 text-sm font-semibold"
            style={{
              background:
                marginTone === "success"
                  ? "rgba(22,163,74,0.18)"
                  : marginTone === "warning"
                  ? "rgba(217,119,6,0.18)"
                  : "rgba(220,38,38,0.2)",
              color:
                marginTone === "success" ? "#4ade80" : marginTone === "warning" ? "#fbbf24" : "#f87171",
            }}
          >
            Margem de lucro: {formatPercent(breakdown.marginPercent)}
          </div>
        </Card>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-white/60" : "text-white/85"}>{label}</span>
      <span className={strong ? "font-bold text-base" : muted ? "text-white/75" : ""}>{value}</span>
    </div>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="lg" disabled={pending}>
      {pending && <Loader2 size={16} className="animate-spin" />}
      {isEdit ? "Salvar alterações" : "Cadastrar produto"}
    </Button>
  );
}
