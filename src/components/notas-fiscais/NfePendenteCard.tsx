"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, CheckCheck, Download, Loader2, Mail, Sparkles, X } from "lucide-react";
import { Card, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, IntegerInput, Label, Select } from "@/components/ui/Field";
import { approveNfePendente, rejectNfePendente, type NfePendenteComConta } from "@/actions/nfe";
import type { StockItemRow } from "@/actions/stock";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type NfeItemParsed } from "@/db/schema";
import { matchStockItem, NOVO_PRODUTO_SENTINEL } from "@/lib/stock-matching";
import type { ActionResult } from "@/actions/products";

export function NfePendenteCard({
  nota,
  stockItems,
}: {
  nota: NfePendenteComConta;
  stockItems: StockItemRow[];
}) {
  const approveAction = approveNfePendente.bind(null, nota.id);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(approveAction, null);
  const errors = state && !state.ok ? state.errors : {};
  const [rejecting, startRejectTransition] = useTransition();
  const [paymentTermDays, setPaymentTermDays] = useState(0);

  const itens = (nota.itens as NfeItemParsed[]) ?? [];
  const valorTotal = Number(nota.valorTotal);

  // Correspondência automática por EAN (prioridade) ou nome idêntico — só
  // quando há certeza; sem isso, o item vem pré-marcado como "produto
  // novo" (o usuário ainda pode trocar manualmente antes de aprovar).
  const suggestedMatches = itens.map((item) => matchStockItem(item, stockItems));

  if (nota.erro) {
    return (
      <Card className="space-y-2 border-danger/30">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-sm">Não deu para ler esse e-mail como NF-e</p>
            <p className="text-xs text-muted mt-0.5">{nota.erro}</p>
          </div>
        </div>
        <ContaEBaixarXml contaEmail={nota.contaEmail} temXml={nota.temXml} nfePendenteId={nota.id} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={rejecting}
          onClick={() => startRejectTransition(() => rejectNfePendente(nota.id))}
        >
          {rejecting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          Descartar
        </Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{nota.fornecedorNome}</p>
          <p className="text-xs text-muted mt-0.5">
            {nota.numeroNota ? `NF-e nº ${nota.numeroNota}` : "Número não identificado"}
            {nota.serieNota ? ` · série ${nota.serieNota}` : ""}
            {nota.dataEmissao ? ` · emitida em ${formatDate(new Date(`${nota.dataEmissao}T00:00:00`))}` : ""}
          </p>
          {nota.fornecedorCnpj && (
            <p className="text-xs text-muted mt-0.5">CNPJ: {nota.fornecedorCnpj}</p>
          )}
          <ContaEBaixarXml contaEmail={nota.contaEmail} temXml={nota.temXml} nfePendenteId={nota.id} />
        </div>
        <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent whitespace-nowrap">
          {formatCurrency(valorTotal)}
        </span>
      </div>

      <form action={formAction} className="space-y-3 border-t border-border pt-3">
        <div className="space-y-2">
          <Label hint="escolha o item do estoque de cada linha, ou deixe em branco pra ignorar">
            Itens da nota
          </Label>
          <div className="space-y-2">
            {itens.map((item, index) => {
              const matchedId = suggestedMatches[index];
              const defaultValue = matchedId ?? NOVO_PRODUTO_SENTINEL;
              return (
                <div
                  key={index}
                  className="rounded-xl border border-border bg-surface-muted/40 p-2.5 space-y-1.5"
                >
                  <p className="text-xs font-medium">{item.descricao}</p>
                  <p className="text-xs text-muted">
                    {item.quantidade}x {formatCurrency(item.valorUnitario)} = {formatCurrency(item.valorTotal)}
                    {item.ean ? ` · EAN ${item.ean}` : ""} · cód. fornecedor {item.codigoFornecedor}
                  </p>
                  {!matchedId && (
                    <p className="flex items-center gap-1 text-xs font-semibold text-accent">
                      <Sparkles size={12} />
                      Não encontramos esse produto no estoque — vai criar um novo (
                      <Badge tone="accent">PRODUTO NOVO</Badge>) a não ser que você escolha outro abaixo.
                    </p>
                  )}
                  <Select name={`item_${index}_stockItemId`} defaultValue={defaultValue}>
                    <option value={NOVO_PRODUTO_SENTINEL}>➕ Criar produto novo com esse item</option>
                    <option value="">Ignorar esse item</option>
                    {stockItems.map((stockItem) => (
                      <option key={stockItem.id} value={stockItem.id}>
                        #{stockItem.internalCode} {stockItem.name} (estoque atual: {stockItem.currentStock})
                      </option>
                    ))}
                  </Select>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Data da compra</Label>
            <Input
              type="date"
              name="purchaseDate"
              defaultValue={nota.dataEmissao ?? ""}
              error={errors.purchaseDate}
              required
            />
          </div>
          <div>
            <Label>Forma de pagamento</Label>
            <Select
              name="paymentMethod"
              defaultValue={nota.formaPagamentoSugerida ?? ""}
              error={errors.paymentMethod}
              required
            >
              <option value="" disabled>
                Selecione...
              </option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label hint="0 = à vista">Prazo de pagamento (dias)</Label>
            <IntegerInput
              name="paymentTermDays"
              min={0}
              value={paymentTermDays}
              onValueChange={setPaymentTermDays}
              error={errors.paymentTermDays}
            />
          </div>
        </div>

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <div className="flex items-center gap-2 pt-1">
          <ApproveButton />
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={rejecting}
            onClick={() => startRejectTransition(() => rejectNfePendente(nota.id))}
          >
            {rejecting ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
            Rejeitar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="md" disabled={pending}>
      {pending ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
      Aprovar e dar entrada no estoque
    </Button>
  );
}

// Mostra em qual caixa de e-mail essa nota chegou (importante com mais de
// uma conta conectada) e, se o XML original ainda está guardado, um link
// pra baixar o arquivo da NF-e direto do navegador.
function ContaEBaixarXml({
  contaEmail,
  temXml,
  nfePendenteId,
}: {
  contaEmail: string;
  temXml: boolean;
  nfePendenteId: string;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted mt-1">
      <span className="inline-flex items-center gap-1">
        <Mail size={12} />
        {contaEmail}
      </span>
      {temXml && (
        <a
          href={`/api/email-nfe/nota/${nfePendenteId}/xml`}
          className="inline-flex items-center gap-1 text-brand hover:underline"
        >
          <Download size={12} />
          Baixar XML
        </a>
      )}
    </p>
  );
}
