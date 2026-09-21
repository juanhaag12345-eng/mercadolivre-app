ALTER TABLE "sales" ADD COLUMN "money_release_balance_synced_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: toda venda já marcada como "released" antes dessa coluna existir
-- já estava embutida no saldo estimado atual de cada conta (calculado pelo
-- código antigo, baseado em período) — marca todas como já contabilizadas
-- pra não somar esse dinheiro de novo na próxima sincronização e dobrar o
-- saldo. Só vendas que ainda estiverem "pending" e forem liberadas dali pra
-- frente é que devem entrar como inflow novo.
UPDATE "sales" SET "money_release_balance_synced_at" = now() WHERE "money_release_status" = 'released' AND "money_release_balance_synced_at" IS NULL;