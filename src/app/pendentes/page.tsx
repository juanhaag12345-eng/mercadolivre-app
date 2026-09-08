import { AlertTriangle, CheckCircle2, Inbox, Plug, Unplug } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { listProducts } from "@/actions/products";
import { getConnectionStatus, listPendingSales } from "@/actions/mercadolivre";
import { PendingSaleCard } from "@/components/pendentes/PendingSaleCard";
import { SyncRecentOrdersButton } from "@/components/pendentes/SyncRecentOrdersButton";
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

  const [connection, pendingSales, products] = await Promise.all([
    getConnectionStatus(),
    listPendingSales(),
    listProducts(),
  ]);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto animate-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Vendas pendentes de entrada</h1>
        <p className="text-sm text-muted mt-0.5">
          Vendas recebidas automaticamente do Mercado Livre, aguardando você confirmar o produto e quem despachou
          antes de entrarem no dashboard.
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

      <Card className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              connection.connected ? "bg-success-soft text-success" : "bg-surface-muted text-muted"
            }`}
          >
            {connection.connected ? <Plug size={18} /> : <Unplug size={18} />}
          </span>
          <div>
            <p className="text-sm font-semibold">
              {connection.connected ? "Conta do Mercado Livre conectada" : "Conta do Mercado Livre não conectada"}
            </p>
            <p className="text-xs text-muted">
              {connection.connected
                ? `Vendedor ${connection.mlUserId} · sessão válida até ${
                    connection.expiresAt ? formatDate(connection.expiresAt) : "—"
                  }`
                : "Conecte a conta vendedora para receber vendas automaticamente."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connection.connected && <SyncRecentOrdersButton />}
          <LinkButton href="/api/mercadolivre/authorize" variant={connection.connected ? "outline" : "secondary"} size="md">
            {connection.connected ? "Reconectar conta" : "Conectar conta do Mercado Livre"}
          </LinkButton>
        </div>
      </Card>

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
            <PendingSaleCard key={pending.id} pending={pending} products={products} />
          ))}
        </div>
      )}
    </div>
  );
}
