import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductForm } from "@/components/products/ProductForm";
import { createProduct } from "@/actions/products";

export default function NovoProdutoPage() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto animate-in">
      <Link href="/produtos" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Voltar para produtos
      </Link>
      <h1 className="text-2xl font-bold mb-1">Novo produto</h1>
      <p className="text-sm text-muted mb-6">
        Preencha as taxas e custos uma vez — toda venda desse produto vai puxar esses dados automaticamente.
      </p>
      <ProductForm action={createProduct} />
    </div>
  );
}
