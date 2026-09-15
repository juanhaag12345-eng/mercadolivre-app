import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { getSale } from "@/actions/sales";
import { SaleEditForm } from "@/components/sales/SaleEditForm";

export const dynamic = "force-dynamic";

export default async function VendaDetalhePage(props: PageProps<"/vendas/[id]">) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const atualizado = searchParams.atualizado === "1";

  const sale = await getSale(id);
  if (!sale) notFound();

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto animate-in">
      <Link href="/vendas" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Voltar para vendas
      </Link>
      <h1 className="text-2xl font-bold mb-1">{sale.productNameSnapshot}</h1>
      <p className="text-sm text-muted mb-6">Detalhes completos da venda — edite o que precisar.</p>

      {atualizado && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 size={16} />
          <span>Venda atualizada com sucesso.</span>
        </div>
      )}

      <SaleEditForm sale={sale} />
    </div>
  );
}
