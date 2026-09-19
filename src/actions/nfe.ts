"use server";

import { revalidatePath } from "next/cache";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { nfeEmailAccounts, nfePendentes, stockItems, stockPurchases, type NfeItemParsed } from "@/db/schema";
import { approveNfeSchema } from "@/lib/validations";
import { scanAllAccountsForNfe } from "@/lib/gmail-nfe";
import { addDays } from "@/lib/dates";
import { matchStockItem, NOVO_PRODUTO_SENTINEL } from "@/lib/stock-matching";
import type { ActionResult } from "@/actions/products";

export async function listEmailAccounts() {
  return db.select().from(nfeEmailAccounts).orderBy(nfeEmailAccounts.email);
}

// Junta com a conta de e-mail pra mostrar em qual caixa cada nota chegou —
// importante assim que tiver mais de uma conta conectada, pra saber de
// onde veio sem precisar adivinhar pelo fornecedor.
export async function listNfePendentes() {
  return db
    .select({
      id: nfePendentes.id,
      emailAccountId: nfePendentes.emailAccountId,
      gmailMessageId: nfePendentes.gmailMessageId,
      fornecedorCnpj: nfePendentes.fornecedorCnpj,
      fornecedorNome: nfePendentes.fornecedorNome,
      numeroNota: nfePendentes.numeroNota,
      serieNota: nfePendentes.serieNota,
      dataEmissao: nfePendentes.dataEmissao,
      valorTotal: nfePendentes.valorTotal,
      formaPagamentoSugerida: nfePendentes.formaPagamentoSugerida,
      itens: nfePendentes.itens,
      // Não trazemos o XML inteiro pra tela (só usado no download, direto
      // do banco em /api/email-nfe/nota/[id]/xml) — só se ele existe, pra
      // decidir se mostra o botão de baixar.
      temXml: sql<boolean>`${nfePendentes.xmlConteudo} is not null`,
      status: nfePendentes.status,
      erro: nfePendentes.erro,
      recebidaEm: nfePendentes.recebidaEm,
      processadaEm: nfePendentes.processadaEm,
      contaEmail: nfeEmailAccounts.email,
    })
    .from(nfePendentes)
    .innerJoin(nfeEmailAccounts, eq(nfePendentes.emailAccountId, nfeEmailAccounts.id))
    .where(eq(nfePendentes.status, "pendente"))
    .orderBy(desc(nfePendentes.recebidaEm));
}

export type NfePendenteComConta = Awaited<ReturnType<typeof listNfePendentes>>[number];

/**
 * Dispara a varredura manual das caixas conectadas — usado pelo botão
 * "Verificar e-mails agora" na tela, além da varredura automática
 * agendada externamente que chama /api/email-nfe/scan.
 */
export async function scanNowAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const summary = await scanAllAccountsForNfe();
    revalidatePath("/notas-fiscais");
    if (summary.erros.length > 0) {
      return {
        ok: false,
        message: `Varredura concluída com erro em: ${summary.erros
          .map((e) => e.email)
          .join(", ")}.`,
      };
    }
    return {
      ok: true,
      message:
        summary.novasPendencias > 0
          ? `${summary.novasPendencias} nota(s) nova(s) encontrada(s).`
          : "Nenhuma nota nova encontrada.",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro na varredura." };
  }
}

function parseItemMappings(formData: FormData, itens: NfeItemParsed[]) {
  return itens.map((item, index) => ({
    item,
    // Pode ser um uuid de item existente, o sentinela "criar produto novo"
    // (ver lib/stock-matching), ou vazio ("Ignorar esse item").
    stockItemId: String(formData.get(`item_${index}_stockItemId`) ?? "").trim() || null,
  }));
}

/**
 * Aprova uma NF-e pendente: para cada item da nota ligado a um item de
 * estoque no formulário, cria uma compra de estoque de verdade
 * (stock_purchases) com a data, forma de pagamento e prazo informados —
 * marcando a origem como "nf" e guardando o número da nota, pra distinguir
 * de compras sem NF no histórico. Itens deixados em branco são ignorados
 * (não geram compra nenhuma). Quando o item não corresponde a nenhum
 * produto já cadastrado (sentinela "criar novo"), cria o item de estoque
 * na hora, marcado como "PRODUTO NOVO" pra revisão depois. Só depois de
 * tudo isso a nota muda de status pra "aprovada" — nunca mexe em estoque
 * real antes da conferência manual.
 */
export async function approveNfePendente(
  nfePendenteId: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = approveNfeSchema.safeParse({
    purchaseDate: String(formData.get("purchaseDate") ?? ""),
    paymentMethod: String(formData.get("paymentMethod") ?? ""),
    paymentTermDays: Number(formData.get("paymentTermDays") ?? 0),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0])] = issue.message;
    }
    return { ok: false, errors };
  }

  const [nota] = await db
    .select()
    .from(nfePendentes)
    .where(eq(nfePendentes.id, nfePendenteId))
    .limit(1);
  if (!nota) {
    return { ok: false, errors: { form: "Nota não encontrada." } };
  }
  if (nota.status !== "pendente") {
    return { ok: false, errors: { form: "Essa nota já foi processada." } };
  }

  const mappings = parseItemMappings(formData, nota.itens as NfeItemParsed[]);
  const selecionados = mappings.filter((m) => m.stockItemId);
  if (selecionados.length === 0) {
    return {
      ok: false,
      errors: { form: "Selecione o item de estoque de pelo menos uma linha da nota." },
    };
  }

  const { purchaseDate, paymentMethod, paymentTermDays } = parsed.data;
  const dueDate = addDays(purchaseDate, paymentTermDays);

  await db.transaction(async (tx) => {
    for (const { item, stockItemId } of selecionados) {
      let resolvedStockItemId = stockItemId!;
      let produtoNovo = false;

      if (stockItemId === NOVO_PRODUTO_SENTINEL) {
        // Reconfere a correspondência com o estoque MAIS RECENTE (dentro da
        // própria transação, não com a lista que veio nas props do
        // formulário) — evita cadastrar o mesmo "produto novo" mais de uma
        // vez quando duas notas com o mesmo item são aprovadas em seguida,
        // antes da tela recarregar com o item recém-criado pela primeira.
        const currentStockItems = await tx
          .select({ id: stockItems.id, name: stockItems.name, ean: stockItems.ean })
          .from(stockItems);
        const freshMatch = matchStockItem(item, currentStockItems);

        if (freshMatch) {
          resolvedStockItemId = freshMatch;
        } else {
          // internalCode não é mais `serial` (ver schema.ts) — calculamos o
          // próximo número (MAX + 1) dentro da própria transação.
          const [{ maxCode }] = await tx
            .select({ maxCode: sql<number>`coalesce(max(${stockItems.internalCode}), 0)` })
            .from(stockItems);
          const [created] = await tx
            .insert(stockItems)
            .values({
              internalCode: maxCode + 1,
              name: item.descricao,
              ean: item.ean,
              minStock: 0,
              criadoAutomaticamente: true,
            })
            .returning({ id: stockItems.id });
          resolvedStockItemId = created.id;
          produtoNovo = true;
        }
      }

      await tx.insert(stockPurchases).values({
        stockItemId: resolvedStockItemId,
        purchaseDate,
        supplier: nota.fornecedorNome,
        unitCost: String(item.valorUnitario),
        quantity: Math.max(1, Math.round(item.quantidade)),
        paymentMethod,
        origem: "nf",
        notaFiscalNumero: nota.numeroNota,
        nfePendenteId: nota.id,
        produtoNovo,
        paymentTermDays,
        dueDate,
      });
    }
    await tx
      .update(nfePendentes)
      .set({ status: "aprovada", processadaEm: new Date() })
      .where(eq(nfePendentes.id, nfePendenteId));
  });

  revalidatePath("/notas-fiscais");
  revalidatePath("/compras");
  revalidatePath("/cadastro-produtos");
  revalidatePath("/pendentes");
  revalidatePath("/");
  return { ok: true };
}

export async function rejectNfePendente(nfePendenteId: string): Promise<void> {
  await db
    .update(nfePendentes)
    .set({ status: "rejeitada", processadaEm: new Date() })
    .where(eq(nfePendentes.id, nfePendenteId));
  revalidatePath("/notas-fiscais");
}
