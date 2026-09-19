"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Check, ChevronDown, ChevronRight, Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { IntegerInput, Input, Label, MoneyInput, Select } from "@/components/ui/Field";
import { PriceHistoryPanel } from "@/components/compras/PriceHistoryPanel";
import {
  deleteStockItem,
  dismissNovoStockItem,
  toggleStockItemActive,
  updateStockItem,
  type StockItemAnalytics,
  type StockItemRow as StockItemRowData,
} from "@/actions/stock";
import { SALE_UNIT_TYPES, SALE_UNIT_TYPE_LABELS, type SaleUnitType } from "@/db/schema";
import { fromReferenceCostPrice, toReferenceCostPrice } from "@/lib/product-pricing";
import { formatCurrency } from "@/lib/format";
import type { ActionResult } from "@/actions/products";

export function StockItemRow({
  item,
  analytics,
}: {
  item: StockItemRowData;
  analytics?: StockItemAnalytics;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const updateAction = updateStockItem.bind(null, item.id);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(updateAction, null);
  const errors = state && !state.ok ? state.errors : {};
  const [name, setName] = useState(item.name);
  const [ean, setEan] = useState(item.ean ?? "");
  const [minStock, setMinStock] = useState(item.minStock);
  const [saleUnitType, setSaleUnitType] = useState<SaleUnitType>(item.saleUnitType);
  const [unitsPerPackage, setUnitsPerPackage] = useState(item.unitsPerPackage);
  const [costPriceInput, setCostPriceInput] = useState(() =>
    fromReferenceCostPrice(item.saleUnitType, item.unitsPerPackage, item.referenceCostPrice)
  );
  const [isTogglingActive, startToggleTransition] = useTransition();
  const [isDismissing, startDismissTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const isPacote = saleUnitType !== "unitario";
  const editedReferenceCostPrice = toReferenceCostPrice(saleUnitType, unitsPerPackage, costPriceInput || undefined);

  // Fecha o modo de edição quando a atualização der certo — comparar com o
  // último `state` já tratado (em vez de um useEffect) evita um re-render
  // extra.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) setEditing(false);
  }

  if (editing) {
    return (
      <tr className="border-b border-border last:border-0 bg-surface-muted/40">
        <td colSpan={6} className="px-4 py-3">
          <form action={formAction} className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Código</Label>
              <span className="flex h-10 items-center text-muted font-mono text-sm">#{item.internalCode}</span>
            </div>
            <div className="min-w-[160px] flex-1">
              <Label>Nome do item</Label>
              <Input name="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
            </div>
            <div className="w-40">
              <Label hint="opcional">EAN</Label>
              <Input name="ean" value={ean} onChange={(e) => setEan(e.target.value)} error={errors.ean} />
            </div>
            <div className="w-28">
              <Label hint="alerta abaixo disso">Estoque mín.</Label>
              <IntegerInput name="minStock" min={0} value={minStock} onValueChange={setMinStock} error={errors.minStock} />
            </div>
            <div className="w-36">
              <Label>Tipo de venda</Label>
              <Select
                name="saleUnitType"
                value={saleUnitType}
                onChange={(e) => setSaleUnitType(e.target.value as SaleUnitType)}
              >
                {SALE_UNIT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {SALE_UNIT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>
            {isPacote && (
              <div className="w-32">
                <Label hint={`unidades por ${SALE_UNIT_TYPE_LABELS[saleUnitType].toLowerCase()}`}>Qtd. no pacote</Label>
                <IntegerInput
                  name="unitsPerPackage"
                  min={1}
                  value={unitsPerPackage}
                  onValueChange={setUnitsPerPackage}
                />
              </div>
            )}
            <div className="w-36">
              <Label hint={isPacote ? "do pacote inteiro" : "por unidade"}>Preço de custo</Label>
              <MoneyInput name="costPriceInput" value={costPriceInput} onValueChange={setCostPriceInput} />
              {isPacote && editedReferenceCostPrice !== null && (
                <p className="mt-1 text-xs text-muted">= {formatCurrency(editedReferenceCostPrice)}/un.</p>
              )}
            </div>
            <SaveButton />
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X size={14} />
            </Button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className={`border-b border-border last:border-0 ${!item.active ? "opacity-50" : ""} ${expanded ? "" : "last:border-0"}`}>
        <td className="px-2 py-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title="Ver histórico de preços"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-muted transition-colors"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="px-2 py-2.5 text-sm text-muted font-mono">#{item.internalCode}</td>
        <td className="px-4 py-2.5 text-sm font-medium">
          <div className="flex flex-wrap items-center gap-1.5">
            <span>{item.name}</span>
            {item.criadoAutomaticamente && (
              <span className="inline-flex items-center gap-1">
                <Badge tone="accent">
                  <Sparkles size={11} className="mr-1 -ml-0.5" />
                  PRODUTO NOVO
                </Badge>
                <button
                  type="button"
                  title="Já revisei — dispensar aviso"
                  disabled={isDismissing}
                  onClick={() => startDismissTransition(() => dismissNovoStockItem(item.id))}
                  className="text-xs text-muted hover:text-foreground underline"
                >
                  ok
                </button>
              </span>
            )}
          </div>
          {item.ean && <p className="text-xs text-muted mt-0.5">EAN {item.ean}</p>}
        </td>
        <td className="px-4 py-2.5 text-sm text-muted">{item.minStock}</td>
        <td className="px-4 py-2.5 text-sm">
          <Badge tone={item.lowStock ? "danger" : "success"}>{item.currentStock} un.</Badge>
        </td>
        <td className="px-4 py-2.5 text-sm text-muted">
          {item.saleUnitType !== "unitario" && (
            <p>
              {SALE_UNIT_TYPE_LABELS[item.saleUnitType]}
              {item.unitsPerPackage > 1 ? ` c/${item.unitsPerPackage}` : ""}
            </p>
          )}
          {item.referenceCostPrice !== null && (
            <p className={item.saleUnitType !== "unitario" ? "text-xs" : ""}>
              {formatCurrency(item.referenceCostPrice)}/un.
            </p>
          )}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              title="Editar"
              onClick={() => setEditing(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              title={item.active ? "Desativar item" : "Reativar item"}
              disabled={isTogglingActive}
              onClick={() => startToggleTransition(() => toggleStockItemActive(item.id, !item.active))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted transition-colors disabled:opacity-50"
            >
              {isTogglingActive ? <Loader2 size={14} className="animate-spin" /> : item.active ? <X size={14} /> : <Check size={14} />}
            </button>
            <button
              type="button"
              title="Excluir item definitivamente"
              disabled={isDeleting}
              onClick={() => {
                if (
                  window.confirm(
                    `Excluir definitivamente "${item.name}"? Só funciona se não houver compra ou venda registrada com ele — essa ação não pode ser desfeita.`
                  )
                ) {
                  startDeleteTransition(async () => {
                    const result = await deleteStockItem(item.id);
                    if (!result.ok && result.message) window.alert(result.message);
                  });
                }
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger transition-colors disabled:opacity-50"
            >
              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border last:border-0 bg-surface-muted/30">
          <td colSpan={7} className="px-4 py-3">
            {analytics ? (
              <PriceHistoryPanel analytics={analytics} />
            ) : (
              <p className="text-sm text-muted py-4 text-center">Nenhuma compra registrada pra esse item ainda.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
    </Button>
  );
}
