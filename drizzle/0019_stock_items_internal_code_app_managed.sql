-- internal_code deixa de ser "serial" (sequência automática do Postgres) e
-- passa a ser gerenciado pela aplicação (ver comentário na coluna em
-- schema.ts) — precisamos tirar o DEFAULT que aponta pra sequência e apagar
-- a sequência em si, senão ela ficaria órfã no banco sem servir pra nada.
ALTER TABLE "stock_items" ALTER COLUMN "internal_code" DROP DEFAULT;
ALTER TABLE "stock_items" ALTER COLUMN "internal_code" SET DATA TYPE integer;
DROP SEQUENCE IF EXISTS "stock_items_internal_code_seq";