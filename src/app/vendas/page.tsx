import Link from "next/link";
import { Plus, CheckCircle2 } from "lucide-react";
import { listProducts } from "@/actions/products";
import { listSales } from "@/actions/sales";
import { SalesFilterBar } from "@/components/sales/SalesFilterBar";
import { SalesTable } from "@/components/sales/SalesTable";
import type { OrderStatus } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function VendasPage(props: PageProps<"/vendas">) {
  const searchParams = await props.searchParams;
  const productId = typeof searchParams.produto === "string" && searchParams.produto ? searchParams.produto : undefined;
  const from = typeof searchParams.de === "string" && searchParams.de ? searchParams.de : undefined;
  const to = typeof searchParams.ate === "string" && searchParams.ate ? searchParams.ate : undefined;
  const status =
    typeof searchParams.status === "string" && searchParams.status
      ? (searchParams.status as OrderStatus)
      : undefined;
  const registrado = typeof searchParams.registrado === "string" ? searchParams.registrado : undefined;

  const [products, sales] = await Promise.all([
    listProducts(),
    listSales({ productId, from, to, status }),
  ]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto animate-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Vendas</h1>
          <p className="text-sm text-muted mt-0.5">Registre vendas e acompanhe tudo que já vendeu.</p>
        </div>
      </div>

      {registrado && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 size={16} />
          <span>Venda de "{registrado}" registrada com sucesso.</span>
        </div>
      )}

      <div className="flex justify-center mb-10">
        <Link
          href="/vendas/nova"
          className="pulse-ring flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-full bg-brand text-neutral-900 shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <Plus size={32} strokeWidth={2.5} />
          <span className="text-[11px] font-bold leading-none">Nova venda</span>
        </Link>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Vendas realizadas</h2>
        </div>
        <SalesFilterBar products={products} current={{ productId, from, to, status }} />
        <SalesTable sales={sales} />
      </div>
    </div>
  );
}
