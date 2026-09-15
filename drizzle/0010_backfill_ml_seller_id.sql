-- Preenche ml_seller_id em vendas/pendentes do Mercado Livre confirmadas
-- ANTES dessa coluna existir (migração 0009) — sem isso, "Atualizar
-- liberações" não consegue saber de qual conta usar o access_token e ignora
-- essas vendas silenciosamente.
--
-- O vendedor de cada pedido já estava salvo o tempo todo dentro de
-- raw_order_payload (o JSON bruto que o Mercado Livre devolve em
-- GET /orders/$id tem um campo "seller": {"id": ...}) — não é uma
-- suposição, é o dado real do pedido, então esse backfill é exato, não uma
-- aproximação.

-- 1) pending_sales: extrai o vendedor direto do payload bruto do pedido.
UPDATE "pending_sales"
SET "ml_seller_id" = raw_order_payload -> 'seller' ->> 'id'
WHERE "ml_seller_id" IS NULL
  AND raw_order_payload -> 'seller' ->> 'id' IS NOT NULL;
--> statement-breakpoint

-- 2) sales: propaga o vendedor a partir da linha de pending_sales que deu
-- origem a essa venda (resulting_sale_id aponta de pending_sales -> sales).
UPDATE "sales"
SET "ml_seller_id" = "pending_sales"."ml_seller_id"
FROM "pending_sales"
WHERE "sales"."id" = "pending_sales"."resulting_sale_id"
  AND "sales"."ml_seller_id" IS NULL
  AND "pending_sales"."ml_seller_id" IS NOT NULL;
