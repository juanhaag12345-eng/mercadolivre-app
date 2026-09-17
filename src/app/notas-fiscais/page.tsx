import { AlertTriangle, CheckCircle2, FileCheck2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { listEmailAccounts, listNfePendentes } from "@/actions/nfe";
import { listStockItemsWithStock } from "@/actions/stock";
import { EmailAccountsPanel } from "@/components/notas-fiscais/EmailAccountsPanel";
import { NfePendenteCard } from "@/components/notas-fiscais/NfePendenteCard";

export const dynamic = "force-dynamic";

const EMAIL_ERROR_MESSAGES: Record<string, string> = {
  state_invalido: "A validação de segurança da conexão falhou. Tente conectar de novo.",
  access_denied: "A autorização foi cancelada.",
};

export default async function NotasFiscaisPage(props: PageProps<"/notas-fiscais">) {
  const searchParams = await props.searchParams;
  const conectado = typeof searchParams.email_conectado === "string" ? searchParams.email_conectado : undefined;
  const erro = typeof searchParams.email_erro === "string" ? searchParams.email_erro : undefined;

  const [accounts, pendentes, stockItems] = await Promise.all([
    listEmailAccounts(),
    listNfePendentes(),
    listStockItemsWithStock({ onlyActive: true }),
  ]);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto animate-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Notas fiscais por e-mail</h1>
        <p className="text-sm text-muted mt-0.5">
          NF-e recebidas por e-mail dos fornecedores, identificadas automaticamente. Confira os itens de cada
          nota e aprove para dar entrada de verdade no estoque.
        </p>
      </div>

      {conectado && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 size={16} />
          <span>Conta {conectado} conectada com sucesso.</span>
        </div>
      )}
      {erro && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle size={16} />
          <span>{EMAIL_ERROR_MESSAGES[erro] ?? `Ocorreu um erro ao conectar: ${erro}`}</span>
        </div>
      )}

      <div className="mb-6">
        <EmailAccountsPanel accounts={accounts} />
      </div>

      {stockItems.length === 0 && (
        <Card className="mb-6 text-sm text-muted">
          Cadastre pelo menos um item em{" "}
          <a href="/compras" className="text-brand underline">
            Compras
          </a>{" "}
          antes de aprovar notas, pra poder ligar os itens da nota a um item de estoque.
        </Card>
      )}

      {pendentes.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center text-muted">
          <FileCheck2 size={28} />
          <p className="text-sm">Nenhuma nota fiscal aguardando conferência.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {pendentes.map((nota) => (
            <NfePendenteCard key={nota.id} nota={nota} stockItems={stockItems} />
          ))}
        </div>
      )}
    </div>
  );
}
