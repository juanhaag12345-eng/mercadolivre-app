"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { removeMlAccount } from "@/actions/mercadolivre";

// Botão de excluir uma conta conectada do Mercado Livre (uma por caixinha em
// /pendentes). Pede confirmação antes, já que desconecta de verdade — a
// conta para de sincronizar/receber vendas novas até ser conectada de novo.
// As vendas já importadas ou confirmadas não são apagadas.
export function RemoveMlAccountButton({ accountId }: { accountId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title="Excluir conta"
      aria-label="Excluir conta"
      disabled={isPending}
      onClick={() => {
        const confirmed = window.confirm(
          "Excluir essa conta do Mercado Livre? Ela para de sincronizar vendas novas até ser conectada de novo. As vendas já importadas continuam no histórico."
        );
        if (!confirmed) return;
        startTransition(() => {
          removeMlAccount(accountId);
        });
      }}
    >
      {isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} className="text-danger" />}
    </Button>
  );
}
