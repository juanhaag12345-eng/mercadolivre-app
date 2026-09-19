import { X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { accountLabel } from "@/lib/accounts";
import type { MlConnection } from "@/lib/mercadolivre";

// Filtro simples por conta do Mercado Livre (?conta=<id do vendedor>) —
// usado em telas que não têm outros filtros (Pendentes, Liberações,
// Anúncios). Some sozinho quando só há uma conta conectada (ou nenhuma),
// já que não haveria nada pra filtrar.
export function AccountFilterBar({
  connections,
  current,
  action,
}: {
  connections: MlConnection[];
  current?: string;
  action: string;
}) {
  if (connections.length < 2) return null;

  return (
    <Card className="mb-6">
      <form action={action} method="GET" className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <label className="mb-1.5 block text-sm font-medium">Conta do Mercado Livre</label>
          <Select name="conta" defaultValue={current ?? ""}>
            <option value="">Todas as contas (somatório)</option>
            {connections.map((c) => (
              <option key={c.id} value={c.mlUserId}>
                {accountLabel(c)}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-xl bg-foreground px-5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Filtrar
        </button>
        {current && (
          <a
            href={action}
            className="flex h-10 items-center gap-1 rounded-xl px-3 text-sm text-muted hover:text-foreground"
          >
            <X size={14} /> Limpar
          </a>
        )}
      </form>
    </Card>
  );
}
