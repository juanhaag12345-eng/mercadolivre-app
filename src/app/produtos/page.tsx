import Link from "next/link";
import { Plus, Package, PackageX, CheckCircle2, ShoppingBag } from "lucide-react";
import { listProducts } from "@/actions/products";
import { listAdTitleSummaries } from "@/actions/sales";
import { ProductSearchBar } from "@/components/products/ProductSearchBar";
import { Badge, Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { calculateFinancials, toNumber } from "@/lib/calculations";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProdutosPage(props: PageProps<"/produtos">) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q : undefined;
  const criado = typeof searchParams.criado === "string" ? searchParams.criado : undefined;
  const atualizado = typeof searchParams.atualizado === "string" ? searchParams.atualizado : undefined;
  const excluido = searchParams.excluido === "1";

  const [productList, adTitles] = await Promise.all([listProducts(q), listAdTitleSummaries()]);
  const filteredAdTitles = q
    ? adTitles.filter((a) => a.title.toLowerCase().includes(q.toLowerCase()))
    : adTitles;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto animate-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-muted mt-0.5">
            Catálogo manual (taxas, frete e custos configurados por você) e anúncios vendidos pelo Mercado Livre
            (dados reais, abaixo).
          </p>
        </div>
        <LinkButton href="/produtos/novo" variant="secondary" size="lg">
          <Plus size={18} /> Novo produto
        </LinkButton>
      </div>

      {(criado || atualizado || excluido) && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 size={16} />
          {criado && <span>Produto "{criado}" cadastrado com sucesso.</span>}
          {atualizado && <span>Produto "{atualizado}" atualizado.</span>}
          {excluido && <span>Produto excluído.</span>}
        </div>
      )}

      <div className="mb-5">
        <ProductSearchBar />
      </div>

      {productList.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <PackageX size={40} className="text-muted mb-3" />
          <p className="font-semibold">Nenhum produto encontrado</p>
          <p className="text-sm text-muted mt-1 mb-4">
            {q ? "Tente buscar por outro nome." : "Cadastre seu primeiro produto para começar."}
          </p>
          {!q && (
            <LinkButton href="/produtos/novo" variant="secondary">
              <Plus size={16} /> Cadastrar produto
            </LinkButton>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {productList.map((product) => {
            const breakdown = calculateFinancials({
              unitPrice: toNumber(product.unitPrice),
              kitQuantity: product.kitQuantity,
              saleFeeType: product.saleFeeType,
              saleFeeValue: toNumber(product.saleFeeValue),
              shippingCost: toNumber(product.shippingCost),
              packagingCost: toNumber(product.packagingCost),
              productCost: toNumber(product.productCost),
            });
            const marginTone =
              breakdown.marginPercent >= 20 ? "success" : breakdown.marginPercent >= 0 ? "warning" : "danger";

            return (
              <Link key={product.id} href={`/produtos/${product.id}`}>
                <Card className="h-full transition-shadow hover:shadow-lg cursor-pointer">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                        <Package size={16} className="text-muted" />
                      </span>
                      <p className="font-semibold text-sm leading-snug line-clamp-2">{product.name}</p>
                    </div>
                    {!product.active && <Badge tone="neutral">Inativo</Badge>}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <Badge tone="neutral" className="font-mono">
                      #{product.internalCode}
                    </Badge>
                    {product.isKit && <Badge tone="accent">Kit x{product.kitQuantity}</Badge>}
                    {product.freeShipping && <Badge tone="neutral">Frete grátis</Badge>}
                  </div>

                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted">Preço de venda</p>
                      <p className="text-lg font-bold">
                        {formatCurrency(toNumber(product.unitPrice) * product.kitQuantity)}
                      </p>
                    </div>
                    <Badge tone={marginTone}>{formatPercent(breakdown.marginPercent)} margem</Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mt-10 mb-5">
        <ShoppingBag size={18} className="text-muted" />
        <div>
          <h2 className="text-lg font-bold">Anúncios do Mercado Livre</h2>
          <p className="text-xs text-muted">
            Cada anúncio vendido a partir de 01/09/2026, com receita, lucro e margem calculados a partir dos dados
            reais do Mercado Livre.
          </p>
        </div>
      </div>

      {filteredAdTitles.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <ShoppingBag size={32} className="text-muted mb-3" />
          <p className="font-semibold text-sm">Nenhum anúncio vendido ainda</p>
          <p className="text-xs text-muted mt-1 max-w-sm">
            Assim que uma venda do Mercado Livre for confirmada em /pendentes, o anúncio aparece aqui.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAdTitles.map((ad) => {
            const marginTone = ad.marginPercent >= 20 ? "success" : ad.marginPercent >= 0 ? "warning" : "danger";
            return (
              <Card key={ad.title}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                      <ShoppingBag size={16} className="text-muted" />
                    </span>
                    <p className="font-semibold text-sm leading-snug line-clamp-2">{ad.title}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <Badge tone="neutral">{ad.quantity} vendido(s)</Badge>
                  <Badge tone="neutral">última venda {formatDate(ad.lastSaleDate)}</Badge>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted">Receita acumulada</p>
                    <p className="text-lg font-bold">{formatCurrency(ad.revenue)}</p>
                  </div>
                  <Badge tone={marginTone}>{formatPercent(ad.marginPercent)} margem</Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
