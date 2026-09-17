import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PurchaseFilter } from "@/actions/stock";

const TABS: { value: PurchaseFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "nf", label: "Com NF" },
  { value: "sem_nf", label: "Sem NF" },
  { value: "pendente", label: "Pendentes de pagamento" },
  { value: "pago", label: "Pagas" },
];

/**
 * Filtro simples do histórico de compras — mesma tela, sem duplicar UI
 * pra "compras com NF" vs "compras sem NF" (pedido explícito de não criar
 * duas telas diferentes). Guiado por query param pra funcionar sem JS.
 */
export function PurchaseFilterTabs({ current }: { current: PurchaseFilter }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TABS.map((tab) => (
        <Link
          key={tab.value}
          href={tab.value === "todas" ? "/compras" : `/compras?filtro=${tab.value}`}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            current === tab.value
              ? "bg-foreground text-white"
              : "bg-surface-muted text-neutral-600 hover:bg-surface-muted/70"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
