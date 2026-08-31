"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteSale, updateSaleStatus } from "@/actions/sales";
import type { OrderStatus } from "@/db/schema";

export function SaleStatusSelect({ saleId, status }: { saleId: string; status: OrderStatus }) {
  const [isPending, startTransition] = useTransition();
  return (
    <div className="relative inline-flex items-center">
      <select
        defaultValue={status}
        disabled={isPending}
        onChange={(e) => startTransition(() => updateSaleStatus(saleId, e.target.value as OrderStatus))}
        className={`h-8 rounded-full border-0 pl-3 pr-7 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30 ${
          status === "despachado" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
        }`}
      >
        <option value="pendente">Pendente</option>
        <option value="despachado">Despachado</option>
      </select>
      {isPending && <Loader2 size={12} className="animate-spin absolute right-2" />}
    </div>
  );
}

export function DeleteSaleButton({ saleId, productName }: { saleId: string; productName: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      title="Excluir venda"
      onClick={() => {
        if (window.confirm(`Excluir a venda de "${productName}"?`)) {
          startTransition(() => deleteSale(saleId));
        }
      }}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger transition-colors disabled:opacity-50"
    >
      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  );
}
