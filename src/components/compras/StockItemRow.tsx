"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { IntegerInput, Input } from "@/components/ui/Field";
import { toggleStockItemActive, updateStockItem, type StockItemRow as StockItemRowData } from "@/actions/stock";
import type { ActionResult } from "@/actions/products";

export function StockItemRow({ item }: { item: StockItemRowData }) {
  const [editing, setEditing] = useState(false);
  const updateAction = updateStockItem.bind(null, item.id);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(updateAction, null);
  const errors = state && !state.ok ? state.errors : {};
  const [name, setName] = useState(item.name);
  const [minStock, setMinStock] = useState(item.minStock);
  const [isTogglingActive, startToggleTransition] = useTransition();

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
        <td colSpan={5} className="px-4 py-3">
          <form action={formAction} className="flex flex-wrap items-end gap-3">
            <span className="text-muted font-mono text-sm">#{item.internalCode}</span>
            <div className="min-w-[160px] flex-1">
              <Input name="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
            </div>
            <div className="w-28">
              <IntegerInput name="minStock" min={0} value={minStock} onValueChange={setMinStock} error={errors.minStock} />
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
    <tr className={`border-b border-border last:border-0 ${!item.active ? "opacity-50" : ""}`}>
      <td className="px-4 py-2.5 text-sm text-muted font-mono">#{item.internalCode}</td>
      <td className="px-4 py-2.5 text-sm font-medium">{item.name}</td>
      <td className="px-4 py-2.5 text-sm text-muted">{item.minStock}</td>
      <td className="px-4 py-2.5 text-sm">
        <Badge tone={item.lowStock ? "danger" : "success"}>{item.currentStock} un.</Badge>
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
        </div>
      </td>
    </tr>
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
