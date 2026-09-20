import { AlertTriangle, ShieldCheck, CreditCard } from "lucide-react";
import { Card, Badge } from "@/components/ui/Card";
import { formatCurrency, formatDate } from "@/lib/format";
import type { FluxoCaixaData } from "@/actions/liberacoes";

/**
 * Card de risco de fluxo de caixa: compara o saldo estimado (atual +
 * liberações previstas) com as compras a pagar, pra avisar se alguma delas
 * — em especial a fatura do cartão, vencimento todo dia 10 — corre risco de
 * ficar sem saldo suficiente na data. Só aparece com conteúdo útil depois
 * que o saldo das contas Mercado Pago estiver configurado (ver
 * SaldoMercadoPagoCard) — sem isso não tem como saber quanto já está
 * disponível hoje.
 */
export function RiscoFluxoCaixaCard({ data }: { data: FluxoCaixaData }) {
  if (!data.temSaldoConfigurado) {
    return (
      <Card className="mb-6 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-muted">
          <CreditCard size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold">Alerta de pagamentos ainda não disponível</p>
          <p className="text-xs text-muted mt-0.5">
            Configure o saldo de hoje das contas Mercado Pago (logo acima) pra eu conseguir avisar se vai faltar
            saldo até a fatura do cartão ou alguma outra compra vencer.
          </p>
        </div>
      </Card>
    );
  }

  const temRisco = data.riscos.length > 0 || data.proximaFaturaCartao?.risco;

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            temRisco ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
          }`}
        >
          {temRisco ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
        </span>
        <div>
          <p className="text-sm font-semibold">
            {temRisco ? "Risco de faltar saldo em algum pagamento" : "Nenhum risco de atraso identificado"}
          </p>
          <p className="text-xs text-muted mt-0.5">
            Considerando o saldo estimado das duas contas ({formatCurrency(data.saldoAtualTotal)}) somado às
            liberações previstas, contra as compras pendentes registradas em Compras.
          </p>
        </div>
      </div>

      {data.proximaFaturaCartao && (
        <div
          className={`rounded-xl border p-3 mb-3 ${
            data.proximaFaturaCartao.risco ? "border-danger/40 bg-danger-soft" : "border-success/40 bg-success-soft"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <CreditCard size={14} /> Fatura do cartão · vence {formatDate(data.proximaFaturaCartao.date)}
            </p>
            <Badge tone={data.proximaFaturaCartao.risco ? "danger" : "success"}>
              {data.proximaFaturaCartao.risco ? "risco de faltar" : "coberta"}
            </Badge>
          </div>
          <p className="text-xs text-muted mt-1">
            Total no cartão: <span className="font-semibold text-foreground">{formatCurrency(data.proximaFaturaCartao.total)}</span>
            {" · "}saldo projetado até lá:{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(data.proximaFaturaCartao.saldoProjetadoNoDia)}
            </span>
          </p>
        </div>
      )}

      {data.riscos.length > 0 && (
        <div className="space-y-2">
          {data.riscos.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs">
              <span>
                <span className="font-semibold">{formatDate(r.date)}</span> — {r.descricao}
              </span>
              <span className="font-semibold text-danger">faltam {formatCurrency(r.faltam)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
