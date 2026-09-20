import Link from "next/link";
import { AlertTriangle, CheckCircle2, Inbox, Plug, Plus, Unplug } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import {
  listAdTitleMappings,
  listAutoConfirmedSales,
  listConnections,
  listPendingSales,
} from "@/actions/mercadolivre";
import { listStockItemsWithStock } from "@/actions/stock";
import { PendingSaleCard } from "@/components/pendentes/PendingSaleCard";
import { SyncRecentOrdersButton } from "@/components/pendentes/SyncRecentOrdersButton";
import { RemoveMlAccountButton } from "@/components/pendentes/RemoveMlAccountButton";
import { AutoConfirmedSalesList } from "@/components/pendentes/AutoConfirmedSalesList";
import { AdTitleMappingsPanel } from "@/components/pendentes/AdTitleMappingsPanel";
import { ConnectionNicknameEditor } from "@/components/pendentes/ConnectionNicknameEditor";
import { AccountFilterBar } from "@/components/shared/AccountFilterBar";
import { accountLabel } from "@/lib/accounts";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const ML_ERROR_MESSAGES: Record<string, string> = {
  state_invalido: "A validação de segurança da conexão falhou. Tente conectar de novo.",
  troca_token_falhou: "Não foi possível concluir a conexão com o Mercado Livre. Tente de novo.",
};

export default async function PendentesPage(props: PageProps<"/pendentes">) {
  const searchParams = await props.searchParams;
  const conectado = searchParams.ml_conectado === "1";
  const erro = typeof searchParams.ml_erro === "string" ? searchParams.ml_erro : undefined;
  const mlSellerId = typeof searchParams.conta === "string" && searchParams.conta ? searchParams.conta : undefined;

  const [connections, pendingSales, stockItems, autoConfirmedSales, adTitleMappings] = await Promise.all([
    listConnections(),
    listPendingSales(mlSellerId),
    listStockItemsWithStock({ onlyActive: true }),
    listAutoConfirmedSales(),
    listAdTitleMappings(),
  ]);

  const accountLabelByMlUserId = new Map(connections.map((c) => [c.mlUserId, accountLabel(c)]));

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto animate-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Vendas pendentes de entrada</h1>
        <p className="text-sm text-muted mt-0.5">
          Vendas recebidas automaticamente do Mercado Livre, aguardando você preencher o custo do produto e quem
          despachou antes de entrarem no dashboard.
        </p>
      </div>

      {conectado && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 size={16} />
          <span>Conta do Mercado Livre conectada com sucesso.</span>
        </div>
      )}
      {erro && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle size={16} />
          <span>{ML_ERROR_MESSAGES[erro] ?? "Ocorreu um erro ao conectar com o Mercado Livre."}</span>
        </div>
      )}

      <div className="mb-6 space-y-3">
        {connections.length === 0 ? (
          <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted text-muted">
                <Unplug size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold">Nenhuma conta do Mercado Livre conectada</p>
                <p className="text-xs text-muted">
                  Conecte a conta vendedora para receber vendas automaticamente.
                </p>
              </div>
            </div>
            <LinkButton href="/api/mercadolivre/authorize" variant="secondary" size="md">
              Conectar conta do Mercado Livre
            </LinkButton>
          </Card>
        ) : (
          connections.map((connection) => (
            <Card
              key={connection.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-soft text-success">
                  <Plug size={18} />
                </span>
                <div>
                  <ConnectionNicknameEditor
                    connectionId={connection.id}
                    nickname={connection.nickname}
                    mlUserId={connection.mlUserId}
                  />
                  <p className="text-xs text-muted">
                    Vendedor {connection.mlUserId} · sessão válida até {formatDate(connection.expiresAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <SyncRecentOrdersButton accountId={connection.id} />
                <RemoveMlAccountButton accountId={connection.id} />
              </div>
            </Card>
          ))
        )}

        {connections.length > 0 && (
          <LinkButton
            href="/api/mercadolivre/authorize"
            variant="outline"
            size="md"
            className="w-full sm:w-auto"
          >
            <Plus size={16} />
            Adicionar outra conta
          </LinkButton>
        )}
      </div>

      <AccountFilterBar connections={connections} current={mlSellerId} action="/pendentes" />

      <AutoConfirmedSalesList sales={autoConfirmedSales} accountLabelByMlUserId={accountLabelByMlUserId} />

      <AdTitleMappingsPanel mappings={adTitleMappings} stockItems={stockItems} />

      {stockItems.length === 0 && pendingSales.length > 0 && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle size={16} />
          <span>
            Nenhum item de estoque cadastrado ainda — cadastre pelo menos um em{" "}
            <Link href="/compras" className="font-semibold underline">
              Compras
            </Link>{" "}
            antes de confirmar uma venda, pra poder dar baixa no estoque certo.
          </span>
        </div>
      )}

      {pendingSales.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-muted">
            <Inbox size={22} />
          </span>
          <p className="font-semibold text-sm">Nenhuma venda pendente</p>
          <p className="text-xs text-muted max-w-sm">
            Assim que uma venda nova chegar do Mercado Livre, ela aparece aqui para você revisar antes de entrar no
            dashboard.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {pendingSales.map((pending) => (
            <PendingSaleCard key={pending.id} pending={pending} stockItems={stockItems} />
          ))}
        </div>
      )}
    </div>
  );
}
