import { Filter, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import type { Product } from "@/db/schema";

export function SalesFilterBar({
  products,
  current,
}: {
  products: Product[];
  current: { productId?: string; from?: string; to?: string; status?: string };
}) {
  const hasFilters = current.productId || current.from || current.to || current.status;
  return (
    <Card>
      <form action="/vendas" method="GET" className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-56">
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
            <Filter size={14} className="text-muted" /> Produto
          </label>
          <Select name="produto" defaultValue={current.productId ?? ""}>
            <option value="">Todos os produtos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.internalCode} — {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <label className="mb-1.5 block text-sm font-medium">De</label>
          <Input type="date" name="de" defaultValue={current.from ?? ""} />
        </div>
        <div className="w-40">
          <label className="mb-1.5 block text-sm font-medium">Até</label>
          <Input type="date" name="ate" defaultValue={current.to ?? ""} />
        </div>
        <div className="w-40">
          <label className="mb-1.5 block text-sm font-medium">Status</label>
          <Select name="status" defaultValue={current.status ?? ""}>
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="despachado">Despachado</option>
          </Select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-xl bg-foreground px-5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Filtrar
        </button>
        {hasFilters && (
          <a
            href="/vendas"
            className="flex h-10 items-center gap-1 rounded-xl px-3 text-sm text-muted hover:text-foreground"
          >
            <X size={14} /> Limpar
          </a>
        )}
      </form>
    </Card>
  );
}
