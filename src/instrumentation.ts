// Hook especial do Next.js: `register()` roda UMA VEZ quando o processo do
// servidor sobe (não em cada requisição, não em cada clique) — é o lugar
// certo pra manter algo rodando sozinho em segundo plano enquanto o app
// estiver no ar.
//
// Usado aqui só pra manter as liberações de vendas do Mercado Livre
// atualizadas automaticamente, sem depender de alguém clicar em "Atualizar
// liberações" em /liberacoes. Antes disso esse clique manual era a ÚNICA
// forma de descobrir se o dinheiro de uma venda já tinha sido liberado pela
// Mercado Pago — se ninguém clicasse por alguns dias, vendas já depositadas
// continuavam aparecendo como pendentes indefinidamente (foi exatamente o
// que o usuário percebeu em 28/09/2026: valores desde o dia 23 ainda
// marcados como não liberados).
export async function register() {
  // instrumentation.ts também é carregado no runtime "edge" (ex.: se algum
  // dia existir middleware) — o job usa o banco de dados e chamadas HTTP
  // via Node, então só faz sentido no runtime "nodejs".
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Evita registrar o intervalo mais de uma vez no mesmo processo (ex.: o
  // Next chamando register() de novo em cenários incomuns de dev/reload).
  const g = globalThis as unknown as { __liberacoesSyncStarted?: boolean };
  if (g.__liberacoesSyncStarted) return;
  g.__liberacoesSyncStarted = true;

  const { runAtualizarLiberacoes } = await import("@/lib/liberacoes-sync");

  // A liberação do dinheiro pela Mercado Pago não é algo que muda minuto a
  // minuto — verificar a cada 3 horas já é mais que suficiente pra nunca
  // deixar uma venda "esquecida" como pendente por dias, sem ficar batendo
  // sem necessidade na API do Mercado Livre/Mercado Pago.
  const INTERVAL_MS = 3 * 60 * 60 * 1000;
  // Espera o servidor terminar de subir (conexão com o banco, etc.) antes da
  // primeira checagem.
  const STARTUP_DELAY_MS = 30 * 1000;

  async function runOnce() {
    try {
      const result = await runAtualizarLiberacoes();
      console.log(`[liberacoes-sync] ${result.message}`);
    } catch (err) {
      console.error("[liberacoes-sync] falha ao atualizar liberações automaticamente:", err);
    }
  }

  setTimeout(() => {
    runOnce();
    setInterval(runOnce, INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
