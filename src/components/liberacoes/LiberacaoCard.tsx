import { Wallet, Clock } from "lucide-react";
import { Card, Badge } from "@/components/ui/Card";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import type { LiberacaoRow } from "@/actions/liberacoes";

export function LiberacaoCard({ sale, accountLabel }: { sale: LiberacaoRow; accountLabel: string | null }) {
  const saleDateObj = new Date(sale.saleDate + "T00:00:00");

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{sale.productNameSnapshot}</p>
          <p className="text-xs text-muted mt-0.5">
            Pedido ML #{sale.mlOrderId}
            {sale.mlPackId && sale.mlPackId !== sale.mlOrderId
              ? ` (venda #${sale.mlPackId} na Central de Vendedores)`
              : ""}{" "}
            · vendida em {formatDate(saleDateObj)}
          </p>
          {(sale.buyerFullName || sale.buyerNickname) && (
            <p className="text-xs text-muted mt-0.5">
              Cliente: <span className="font-medium text-foreground">{sale.buyerFullName ?? sale.buyerNickname}</span>
            </p>
          )}
        </div>
        <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Wallet size={16} />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-muted">
          Receita: <span className="font-semibold text-foreground">{formatCurrency(sale.revenue)}</span>
        </span>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-muted">
          Tarifa de venda: <span className="font-semibold text-foreground">{formatCurrency(sale.saleFeeAmount)}</span>
        </span>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-muted">
          Frete: <span className="font-semibold text-foreground">{formatCurrency(sale.shippingTotal)}</span>
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <div>
          <p className="text-xs text-muted">Valor líquido a receber</p>
          <p className="text-lg font-bold text-success">{formatCurrency(sale.netAmount)}</p>
        </div>
        <div className="text-right">
          {sale.moneyReleaseDate ? (
            <>
              <p className="text-xs text-muted">Previsão de liberação</p>
              <p className="text-sm font-semibold">
                {formatDate(sale.moneyReleaseDate)} às {formatTime(sale.moneyReleaseDate)}
              </p>
            </>
          ) : (
            <Badge tone="neutral">Ainda não verificado</Badge>
          )}
          {sale.moneyReleaseStatus && (
            <Badge tone="warning" className="mt-1">
              {sale.moneyReleaseStatus}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{accountLabel ?? "Conta não identificada"}</span>
        {sale.moneyReleaseCheckedAt && (
          <span className="flex items-center gap-1">
            <Clock size={11} />
            verificado em {formatDate(sale.moneyReleaseCheckedAt)} às {formatTime(sale.moneyReleaseCheckedAt)}
          </span>
        )}
      </div>
    </Card>
  );
}
