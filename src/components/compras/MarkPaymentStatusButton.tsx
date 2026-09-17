"use client";

import { useTransition } from "react";
import { CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { setPurchasePaymentStatus } from "@/actions/stock";
import type { PaymentStatus } from "@/db/schema";

export function MarkPaymentStatusButton({
  purchaseId,
  currentStatus,
}: {
  purchaseId: string;
  currentStatus: PaymentStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const next: PaymentStatus = currentStatus === "pago" ? "pendente" : "pago";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => setPurchasePaymentStatus(purchaseId, next))}
    >
      {isPending ? (
        <Loader2 size={14} className="animate-spin" />
      ) : currentStatus === "pago" ? (
        <Undo2 size={14} />
      ) : (
        <CheckCircle2 size={14} />
      )}
      {currentStatus === "pago" ? "Marcar como pendente" : "Marcar como pago"}
    </Button>
  );
}
