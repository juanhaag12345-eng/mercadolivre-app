import { HandCoins, Package } from "lucide-react";
import { getSupplyCostData } from "@/actions/supply-cost";
import { ProductSearchBar } from "@/components/products/ProductSearchBar";
import { SupplyCostTable } from "@/components/products/SupplyCostTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustoFornecimentoPage(props: PageProps<"/custo-fornecimento">) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q : undefined;

  const { rows, totalSpentAll, totalProducts } = await getSupplyCostData(q);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto animate-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Custo de fornecimento</h1>
          <p className="text-sm text-muted mt-0.5">
            Custo unitário cadastrado e quanto já foi gasto com cada produto, com base nas vendas registradas.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard
          label="Gasto total com fornecedores"
          value={formatCurrency(totalSpentAll)}
          icon={HandCoins}
        />
        <StatCard label="Produtos cadastrados" value={String(totalProducts)} icon={Package} />
      </div>

      <div className="mb-5">
        <ProductSearchBar placeholder="Buscar produto pelo nome..." />
      </div>

      <SupplyCostTable rows={rows} />
    </div>
  );
}
