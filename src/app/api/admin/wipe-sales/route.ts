import { NextRequest, NextResponse } from "next/server";
import { lt } from "drizzle-orm";
import { db } from "@/db";
import { pendingSales } from "@/db/schema";

export const dynamic = "force-dynamic";

const CUTOFF = new Date("2026-09-01T00:00:00-03:00");

// Endpoint administrativo temporário e de uso único: limpeza pontual de
// vendas pendentes antigas (anteriores a 01/09/2026) que voltaram a
// aparecer em /pendentes por causa de um reenvio de notificação do webhook
// do Mercado Livre sobre pedidos antigos — bug já corrigido no
// upsertPendingSalesFromOrder, mas que precisa dessa limpeza pontual para
// os registros que já tinham entrado antes da correção.
//
// Só apaga pending_sales com order_date anterior ao corte; não mexe na
// tabela sales. Protegido por ADMIN_WIPE_TOKEN (variável de ambiente na
// Railway). Deve ser removido do código logo após o uso.
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

  const deleted = await db
    .delete(pendingSales)
    .where(lt(pendingSales.orderDate, CUTOFF))
    .returning({ id: pendingSales.id });

  return NextResponse.json({
    ok: true,
    deletedStalePendingSales: deleted.length,
    cutoff: CUTOFF.toISOString(),
  });
}
