import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { nfePendentes } from "@/db/schema";

export const dynamic = "force-dynamic";

// Deixa baixar o XML original de uma NF-e recebida por e-mail, direto da
// tela de conferência — útil pra guardar o arquivo oficial ou conferir
// algo que o parser não mostra. Só serve o que já está gravado no banco
// (nunca busca de novo no Gmail); notas de antes dessa coluna existir
// simplesmente não têm XML pra baixar.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [nota] = await db
    .select({
      numeroNota: nfePendentes.numeroNota,
      fornecedorNome: nfePendentes.fornecedorNome,
      xmlConteudo: nfePendentes.xmlConteudo,
    })
    .from(nfePendentes)
    .where(eq(nfePendentes.id, id))
    .limit(1);

  if (!nota || !nota.xmlConteudo) {
    return NextResponse.json({ error: "XML não encontrado para essa nota." }, { status: 404 });
  }

  const nomeBase = (nota.numeroNota ? `NFe-${nota.numeroNota}` : `NFe-${id}`).replace(
    /[^a-zA-Z0-9-]/g,
    "_"
  );

  return new NextResponse(nota.xmlConteudo, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeBase}.xml"`,
    },
  });
}
