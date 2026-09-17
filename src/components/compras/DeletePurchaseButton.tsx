"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deletePurchase } from "@/actions/stock";

export function DeletePurchaseButton({ purchaseId, itemName }: { purchaseId: string; itemName: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      title="Excluir compra"
      onClick={() => {
        if (window.confirm(`Excluir a compra de "${itemName}"? Isso volta o estoque desse item pra trás.`)) {
          startTransition(() => deletePurchase(purchaseId));
        }
      }}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger transition-colors disabled:opacity-50"
    >
      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  );
}
