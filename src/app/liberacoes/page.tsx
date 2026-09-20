import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { listLiberacoes, getLiberacoesCalendar, getFluxoCaixaRisco } from "@/actions/liberacoes";
import { listConnections } from "@/actions/mercadolivre";
import { listAccountBalances } from "@/actions/mercadopago-balance";
import { LiberacaoCard } from "@/components/liberacoes/LiberacaoCard";
import { AtualizarLiberacoesButton } from "@/components/liberacoes/AtualizarLiberacoesButton";
import { CalendarioLiberacoes } from "@/components/liberacoes/CalendarioLiberacoes";
import { SaldoMercadoPagoCard } from "@/components/liberacoes/SaldoMercadoPagoCard";
import { RiscoFluxoCaixaCard } from "@/components/liberacoes/RiscoFluxoCaixaCard";
import { AccountFilterBar } from "@/components/shared/AccountFilterBar";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LiberacoesPage(props: PageProps<"/liberacoes">) {
  const searchParams = await props.searchParams;
  const mlSellerId = typeof searchParams.conta === "string" && searchParams.conta ? searchParams.conta : undefined;

  const [sales, connections, calendar, balances, fluxoCaixa] = await Promise.all([
    listLiberacoes(mlSellerId),
    listConnections(),
    getLiberacoesCalendar(mlSellerId),
    listAccountBalances(),
    getFluxoCaixaRisco(),
  ]);

  const accountLabelByMlUserId = new Map(
    connections.map((c) => [c.mlUserId, c.nickname ?? `Vendedor ${c.mlUserId}`])
  );

  // Letra de cada conta pro calendário (ex.: "R" de RADAR OFERTAS, "V" de
  // VAREJO EM MOVIMENTO) — primeira letra do apelido. Conta sem apelido
  // ainda cadastrado fica com "?" em vez de arriscar colidir com outra.
  const accountInitials = Object.fromEntries(
    connections.map((c) => [c.mlUserId, c.nickname ? c.nickname.trim().charAt(0).toUpperCase() : "?"])
  );
  const accountLegend = connections.map((c) => ({
    letter: accountInitials[c.mlUserId],
    label: c.nickname ?? `Vendedor ${c.mlUserId}`,
  }));

  const total = sales.reduce((sum, s) => sum + s.netAmount, 0);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto animate-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Liberações pendentes</h1>
          <p className="text-sm text-muted mt-0.5">
            Vendas do Mercado Livre cujo dinheiro ainda não caiu na conta — atualize para consultar a previsão de
            liberação de cada uma.
          </p>
        </div>
        <AtualizarLiberacoesButton />
      </div>

      <CalendarioLiberacoes data={calendar} accountInitials={accountInitials} legend={accountLegend} />

      <SaldoMercadoPagoCard accounts={balances} />

      <RiscoFluxoCaixaCard data={fluxoCaixa} />

      <Card className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-soft text-success">
            <Wallet size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold">{sales.length} venda(s) pendente(s) de liberação</p>
            <p className="text-xs text-muted">Soma do valor líquido a cair na conta</p>
          </div>
        </div>
        <p className="text-xl font-bold text-success">{formatCurrency(total)}</p>
      </Card>

      <AccountFilterBar connections={connections} current={mlSellerId} action="/liberacoes" />

      {sales.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-muted">
            <Wallet size={22} />
          </span>
          <p className="font-semibold text-sm">Nenhuma venda pendente de liberação</p>
          <p className="text-xs text-muted max-w-sm">
            Todas as vendas confirmadas do Mercado Livre já foram liberadas na conta (ou ainda não foram verificadas
            — clique em &ldquo;Atualizar liberações&rdquo;).
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => (
            <LiberacaoCard
              key={sale.id}
              sale={sale}
              accountLabel={sale.mlSellerId ? (accountLabelByMlUserId.get(sale.mlSellerId) ?? null) : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
