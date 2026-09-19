import { CalendarRange, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { formatDate } from "@/lib/format";
import { accountLabel } from "@/lib/accounts";
import type { Product } from "@/db/schema";
import type { MlConnection } from "@/lib/mercadolivre";
import type { PeriodKey } from "@/lib/dashboard-period";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "mes-atual", label: "Este mês" },
  { value: "mes-passado", label: "Mês passado" },
  { value: "7-dias", label: "Últimos 7 dias" },
  { value: "30-dias", label: "Últimos 30 dias" },
  { value: "este-ano", label: "Este ano" },
  { value: "tudo", label: "Todo o período" },
  { value: "personalizado", label: "Personalizado..." },
];

export function DashboardFilterBar({
  products,
  connections,
  current,
  resolvedFrom,
  resolvedTo,
}: {
  products: Product[];
  connections: MlConnection[];
  current: { periodo: PeriodKey; de?: string; ate?: string; produto?: string; conta?: string };
  resolvedFrom?: string;
  resolvedTo?: string;
}) {
  const hasFilters = current.periodo !== "mes-atual" || current.produto || current.conta;

  return (
    <Card className="mb-6">
      <form action="/" method="GET" className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-52">
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
            <CalendarRange size={14} className="text-muted" /> Período
          </label>
          <Select name="periodo" defaultValue={current.periodo}>
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-36">
          <label className="mb-1.5 block text-sm font-medium">De</label>
          <Input type="date" name="de" defaultValue={current.de ?? ""} />
        </div>
        <div className="w-36">
          <label className="mb-1.5 block text-sm font-medium">Até</label>
          <Input type="date" name="ate" defaultValue={current.ate ?? ""} />
        </div>
        <div className="w-full sm:w-56">
          <label className="mb-1.5 block text-sm font-medium">Produto</label>
          <Select name="produto" defaultValue={current.produto ?? ""}>
            <option value="">Todos os produtos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.internalCode} — {p.name}
              </option>
            ))}
          </Select>
        </div>
        {connections.length > 0 && (
          <div className="w-full sm:w-56">
            <label className="mb-1.5 block text-sm font-medium">Conta do Mercado Livre</label>
            <Select name="conta" defaultValue={current.conta ?? ""}>
              <option value="">Todas as contas</option>
              {connections.map((c) => (
                <option key={c.id} value={c.mlUserId}>
                  {accountLabel(c)}
                </option>
              ))}
            </Select>
          </div>
        )}
        <button
          type="submit"
          className="h-10 rounded-xl bg-foreground px-5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Filtrar
        </button>
        {hasFilters && (
          <a
            href="/"
            className="flex h-10 items-center gap-1 rounded-xl px-3 text-sm text-muted hover:text-foreground"
          >
            <X size={14} /> Limpar
          </a>
        )}
      </form>
      {resolvedFrom && resolvedTo && (
        <p className="mt-3 text-xs text-muted">
          Mostrando resultados de {formatDate(resolvedFrom)} até {formatDate(resolvedTo)}
          {current.produto ? " para o produto selecionado" : ""}.
        </p>
      )}
      {!resolvedFrom && !resolvedTo && (
        <p className="mt-3 text-xs text-muted">
          Mostrando resultados de todo o período{current.produto ? " para o produto selecionado" : ""}.
        </p>
      )}
    </Card>
  );
}
