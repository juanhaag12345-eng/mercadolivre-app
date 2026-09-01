"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Package,
  PlusCircle,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, IntegerInput, Label, MoneyInput, Select, Textarea } from "@/components/ui/Field";
import { searchActiveProducts } from "@/actions/products";
import { createSale } from "@/actions/sales";
import { calculateFinancials, toNumber } from "@/lib/calculations";
import { formatCurrency, formatPercent, todayISO } from "@/lib/format";
import { ORDER_STATUSES, type Product } from "@/db/schema";
import type { ActionResult } from "@/actions/products";

export function NovaVendaFlow() {
  const [selected, setSelected] = useState<Product | null>(null);

  if (!selected) {
    return <ProductStep onSelect={setSelected} />;
  }

  return <SaleStep product={selected} onBack={() => setSelected(null)} />;
}

function ProductStep({ onSelect }: { onSelect: (p: Product) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [isPending, startTransition] = useTransition();
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const rows = await searchActiveProducts(query);
        setResults(rows);
        setSearched(true);
      });
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto animate-in">
      <Link href="/vendas" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Cancelar
      </Link>
      <h1 className="text-2xl font-bold mb-1">Nova venda</h1>
      <p className="text-sm text-muted mb-6">Busque o produto que você vendeu.</p>

      <div className="relative mb-4">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite o nome do produto..."
          className="h-14 w-full rounded-2xl border border-border bg-surface pl-12 pr-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
        {isPending && (
          <Loader2 size={18} className="animate-spin absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
        )}
      </div>

      <div className="space-y-2 mb-4">
        {results.map((product) => {
          const breakdown = calculateFinancials({
            unitPrice: toNumber(product.unitPrice),
            kitQuantity: product.kitQuantity,
            saleFeeType: product.saleFeeType,
            saleFeeValue: toNumber(product.saleFeeValue),
            shippingCost: toNumber(product.shippingCost),
            packagingCost: toNumber(product.packagingCost),
            productCost: toNumber(product.productCost),
          });
          return (
            <button
              key={product.id}
              onClick={() => onSelect(product)}
              className="w-full text-left"
            >
              <Card className="flex items-center justify-between gap-3 hover:border-accent hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                    <Package size={18} className="text-muted" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{product.name}</p>
                    <p className="text-xs text-muted">
                      {formatCurrency(toNumber(product.unitPrice) * product.kitQuantity)} · margem{" "}
                      {formatPercent(breakdown.marginPercent)}
                    </p>
                  </div>
                </div>
                {product.isKit && (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                    Kit x{product.kitQuantity}
                  </span>
                )}
              </Card>
            </button>
          );
        })}

        {searched && !isPending && results.length === 0 && (
          <p className="text-sm text-muted text-center py-6">
            Nenhum produto encontrado{query ? ` para "${query}"` : ""}.
          </p>
        )}
      </div>

      <Link href="/produtos/novo">
        <Card className="flex items-center gap-3 border-dashed hover:border-accent hover:bg-accent-soft/40 transition-colors cursor-pointer">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-neutral-900">
            <PlusCircle size={18} />
          </span>
          <div>
            <p className="font-semibold text-sm">Cadastrar novo produto</p>
            <p className="text-xs text-muted">Não encontrou? Cadastre um produto novo.</p>
          </div>
        </Card>
      </Link>
    </div>
  );
}

function SaleStep({ product, onBack }: { product: Product; onBack: () => void }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(createSale, null);
  const errors = state && !state.ok ? state.errors : {};

  const [quantity, setQuantity] = useState(1);
  const [showAdjust, setShowAdjust] = useState(false);
  const [unitPrice, setUnitPrice] = useState(toNumber(product.unitPrice));
  const [shippingCost, setShippingCost] = useState(toNumber(product.shippingCost));
  const [packagingCost, setPackagingCost] = useState(toNumber(product.packagingCost));
  const [productCost, setProductCost] = useState(toNumber(product.productCost));

  const breakdown = calculateFinancials({
    unitPrice,
    kitQuantity: product.kitQuantity,
    saleFeeType: product.saleFeeType,
    saleFeeValue: toNumber(product.saleFeeValue),
    shippingCost,
    packagingCost,
    productCost,
    quantity,
  });

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto animate-in">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Trocar produto
      </button>

      <Card className="flex items-center gap-3 mb-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted">
          <Package size={20} className="text-muted" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold truncate">{product.name}</p>
          <p className="text-xs text-muted">
            {product.isKit ? `Kit com ${product.kitQuantity} unidades · ` : ""}
            {formatCurrency(toNumber(product.unitPrice) * product.kitQuantity)}
          </p>
        </div>
      </Card>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="productId" value={product.id} />

        <Card>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data da venda</Label>
              <Input type="date" name="saleDate" defaultValue={todayISO()} error={errors.saleDate} required />
            </div>
            <div>
              <Label>Quantidade vendida</Label>
              <IntegerInput
                name="quantity"
                min={1}
                value={quantity}
                onValueChange={setQuantity}
                error={errors.quantity}
              />
            </div>
          </div>
          <div className="mt-4">
            <Label>Status do pedido</Label>
            <Select name="orderStatus" defaultValue="pendente" error={errors.orderStatus}>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status === "pendente" ? "Pendente" : "Despachado"}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-4">
            <Label hint="opcional">Observações</Label>
            <Textarea name="notes" rows={2} placeholder="Alguma observação sobre essa venda..." />
          </div>
        </Card>

        <Card>
          <button
            type="button"
            onClick={() => setShowAdjust((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal size={15} className="text-muted" />
              Ajustar valores só desta venda
            </span>
            <ChevronDown size={16} className={`text-muted transition-transform ${showAdjust ? "rotate-180" : ""}`} />
          </button>
          {showAdjust && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <Label hint="por unidade">Valor de venda</Label>
                <MoneyInput
                  name="unitPriceOverride"
                  value={unitPrice}
                  onValueChange={setUnitPrice}
                />
              </div>
              <div>
                <Label>Custo de envio</Label>
                <MoneyInput
                  name="shippingCostOverride"
                  value={shippingCost}
                  onValueChange={setShippingCost}
                />
              </div>
              <div>
                <Label>Custo da embalagem</Label>
                <MoneyInput
                  name="packagingCostOverride"
                  value={packagingCost}
                  onValueChange={setPackagingCost}
                />
              </div>
              <div>
                <Label hint="por unidade">Custo do produto</Label>
                <MoneyInput
                  name="productCostOverride"
                  value={productCost}
                  onValueChange={setProductCost}
                />
              </div>
            </div>
          )}
        </Card>

        <Card className="bg-foreground text-white border-0">
          <div className="flex items-center justify-between">
            <span className="text-white/70 text-sm">Receita</span>
            <span className="font-semibold">{formatCurrency(breakdown.revenue)}</span>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-white/70 text-sm">Lucro estimado</span>
            <span className="font-bold text-lg">{formatCurrency(breakdown.profit)}</span>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-white/70 text-sm">Margem</span>
            <span className="font-semibold">{formatPercent(breakdown.marginPercent)}</span>
          </div>
        </Card>

        {errors.productId && <p className="text-sm text-danger">{errors.productId}</p>}

        <SubmitSaleButton />
      </form>
    </div>
  );
}

function SubmitSaleButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={pending}>
      {pending && <Loader2 size={16} className="animate-spin" />}
      Registrar venda
    </Button>
  );
}
