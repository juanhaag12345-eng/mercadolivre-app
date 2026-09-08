import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sales, pendingSales } from "@/db/schema";

export const dynamic = "force-dynamic";

// Endpoint administrativo temporário e de uso único: apaga todo o histórico
// de vendas (tabelas "sales" e "pending_sales") para reiniciar o dashboard
// do zero, a pedido explícito do usuário, antes de recomeçar a sincronizar
// somente vendas do Mercado Livre emitidas a partir de 01/09/2026.
//
// Protegido por um token em variável de ambiente (ADMIN_WIPE_TOKEN) que só
// existe na Railway; sem ele, ou com um valor incorreto, a rota recusa a
// operação. Depois de usada, deve ser removida do código e a variável de
// ambiente apagada.
export async function GET(request: NextRequest) {
  const expectedToken = process.env.ADMIN_WIPE_TOKEN;
  const providedToken = request.nextUrl.searchParams.get("token");

  if (!expectedToken) {
    return NextResponse.json(
      { error: "ADMIN_WIPE_TOKEN não configurado no ambiente." },
      { status: 500 }
    );
  }

  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  const deletedPending = await db.delete(pendingSales).returning({ id: pendingSales.id });
  const deletedSales = await db.delete(sales).returning({ id: sales.id });

  return NextResponse.json({
    ok: true,
    deletedPendingSales: deletedPending.length,
    deletedSales: deletedSales.length,
  });
}
