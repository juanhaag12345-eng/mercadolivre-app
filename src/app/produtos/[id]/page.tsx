import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProductForm } from "@/components/products/ProductForm";
import { DeleteProductButton } from "@/components/products/DeleteProductButton";
import { getProduct, updateProduct } from "@/actions/products";

export const dynamic = "force-dynamic";

export default async function EditarProdutoPage(props: PageProps<"/produtos/[id]">) {
  const { id } = await props.params;
  const product = await getProduct(id);
  if (!product) notFound();

  const action = updateProduct.bind(null, id);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto animate-in">
      <Link href="/produtos" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Voltar para produtos
      </Link>
      <h1 className="text-2xl font-bold mb-1">{product.name}</h1>
      <p className="text-sm text-muted mb-6">Editar cadastro do produto.</p>
      <ProductForm
        product={product}
        action={action}
        deleteSlot={<DeleteProductButton productId={product.id} productName={product.name} />}
      />
    </div>
  );
}
