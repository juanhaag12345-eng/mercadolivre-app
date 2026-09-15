-- Preenche ml_payment_id em vendas do Mercado Livre confirmadas ANTES dessa
-- coluna existir. Assim como o backfill de ml_seller_id (migração 0010), o
-- dado já estava salvo o tempo todo dentro de raw_order_payload (o pedido
-- bruto tem "payments": [{"id": ...}]) — não é uma suposição, é o ID real
-- do pagamento desse pedido.
UPDATE "sales"
SET "ml_payment_id" = "pending_sales"."raw_order_payload" -> 'payments' -> 0 ->> 'id'
FROM "pending_sales"
WHERE "sales"."id" = "pending_sales"."resulting_sale_id"
  AND "sales"."ml_payment_id" IS NULL
  AND "pending_sales"."raw_order_payload" -> 'payments' -> 0 ->> 'id' IS NOT NULL;
