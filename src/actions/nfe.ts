"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { nfeEmailAccounts, nfePendentes, stockPurchases, type NfeItemParsed } from "@/db/schema";
import { approveNfeSchema } from "@/lib/validations";
import { scanAllAccountsForNfe } from "@/lib/gmail-nfe";
import type { ActionResult } from "@/actions/products";

export async function listEmailAccounts() {
  return db.select().from(nfeEmailAccounts).orderBy(nfeEmailAccounts.email);
}

export async function listNfePendentes() {
  return db
    .select()
    .from(nfePendentes)
    .where(eq(nfePendentes.status, "pendente"))
    .orderBy(desc(nfePendentes.recebidaEm));
}

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
    stockItemId: String(formData.get(`item_${index}_stockItemId`) ?? "").trim() || null,
  }));
}

/**
 * Aprova uma NF-e pendente: para cada item da nota ligado a um item de
 * estoque no formulário, cria uma compra de estoque de verdade
 * (stock_purchases) com a data e forma de pagamento informadas; itens
 * deixados em branco são ignorados (não geram compra nenhuma). Só depois
 * disso a nota muda de status pra "aprovada" — nunca mexe em estoque real
 * antes da conferência manual.
 */
export async function approveNfePendente(
  nfePendenteId: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = approveNfeSchema.safeParse({
    purchaseDate: String(formData.get("purchaseDate") ?? ""),
    paymentMethod: String(formData.get("paymentMethod") ?? ""),
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

  const { purchaseDate, paymentMethod } = parsed.data;

  await db.transaction(async (tx) => {
    for (const { item, stockItemId } of selecionados) {
      await tx.insert(stockPurchases).values({
        stockItemId: stockItemId!,
        purchaseDate,
        supplier: nota.fornecedorNome,
        unitCost: String(item.valorUnitario),
        quantity: Math.max(1, Math.round(item.quantidade)),
        paymentMethod,
      });
    }
    await tx
      .update(nfePendentes)
      .set({ status: "aprovada", processadaEm: new Date() })
      .where(eq(nfePendentes.id, nfePendenteId));
  });

  revalidatePath("/notas-fiscais");
  revalidatePath("/compras");
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
