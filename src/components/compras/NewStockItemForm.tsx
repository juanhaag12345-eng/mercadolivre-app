"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IntegerInput, Label, Input } from "@/components/ui/Field";
import { createStockItem } from "@/actions/stock";
import type { ActionResult } from "@/actions/products";

export function NewStockItemForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(createStockItem, null);
  const errors = state && !state.ok ? state.errors : {};
  const [name, setName] = useState("");
  const [ean, setEan] = useState("");
  const [minStock, setMinStock] = useState(0);
  const [formKey, setFormKey] = useState(0);

  // Reseta o formulário quando a criação der certo — comparar com o último
  // `state` já tratado (em vez de um useEffect) evita um re-render extra.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) {
      setName("");
      setEan("");
      setMinStock(0);
      setOpen(false);
      setFormKey((k) => k + 1);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} />
        Novo item
      </Button>
    );
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-muted/40 p-3">
      <div className="min-w-[180px] flex-1">
        <Label>Nome do item</Label>
        <Input name="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
      </div>
      <div className="w-36">
        <Label hint="opcional">EAN</Label>
        <Input name="ean" value={ean} onChange={(e) => setEan(e.target.value)} error={errors.ean} />
      </div>
      <div className="w-32">
        <Label hint="alerta abaixo disso">Estoque mín.</Label>
        <IntegerInput name="minStock" min={0} value={minStock} onValueChange={setMinStock} error={errors.minStock} />
      </div>
      <div className="flex items-center gap-2">
        <SaveButton />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          <X size={14} />
        </Button>
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
      Adicionar
    </Button>
  );
}
