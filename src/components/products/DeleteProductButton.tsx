"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { deleteProduct } from "@/actions/products";

export function DeleteProductButton({ productId, productName }: { productId: string; productName: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="danger"
      disabled={isPending}
      onClick={() => {
        if (window.confirm(`Excluir o produto "${productName}"? Essa ação não pode ser desfeita.`)) {
          startTransition(() => {
            deleteProduct(productId);
          });
        }
      }}
    >
      {isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
      Excluir produto
    </Button>
  );
}
