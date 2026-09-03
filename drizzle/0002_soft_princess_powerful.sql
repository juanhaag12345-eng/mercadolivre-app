-- Código interno sequencial dos produtos (1, 2, 3...). Preenchemos
-- explicitamente pela ordem de cadastro (created_at) em vez de deixar o
-- Postgres aplicar o DEFAULT automaticamente linha a linha, para garantir
-- que a numeração siga a ordem real em que os produtos foram cadastrados
-- e não a ordem física das linhas na tabela.
ALTER TABLE "products" ADD COLUMN "internal_code" integer;--> statement-breakpoint
UPDATE "products" AS p
SET "internal_code" = ordered.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at" ASC, "id" ASC) AS rn
  FROM "products"
) AS ordered
WHERE p."id" = ordered."id";--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "products_internal_code_seq";--> statement-breakpoint
SELECT setval('products_internal_code_seq', COALESCE((SELECT MAX("internal_code") FROM "products"), 0), true);--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "internal_code" SET DEFAULT nextval('products_internal_code_seq');--> statement-breakpoint
ALTER SEQUENCE "products_internal_code_seq" OWNED BY "products"."internal_code";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "internal_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_internal_code_unique" UNIQUE("internal_code");
