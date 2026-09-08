"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { syncRecentOrders } from "@/actions/mercadolivre";

export function SyncRecentOrdersButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="md"
        disabled={isPending}
        onClick={() => {
          setResult(null);
          startTransition(() => {
            syncRecentOrders().then(setResult);
          });
        }}
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        Buscar vendas recentes
      </Button>
      {result && (
        <p className={`text-xs max-w-xs text-right ${result.ok ? "text-success" : "text-danger"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
