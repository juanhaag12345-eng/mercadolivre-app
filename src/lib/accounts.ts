// Rótulo consistente para uma conta do Mercado Livre conectada, usado em
// todo filtro/seleção por conta (dashboard, vendas, pendentes, liberações,
// anúncios) — cai no ID do vendedor quando a conta não tem apelido definido.
export function accountLabel(connection: { mlUserId: string; nickname: string | null }): string {
  return connection.nickname ?? `Vendedor ${connection.mlUserId}`;
}
