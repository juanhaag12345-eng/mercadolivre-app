-- A linha existente (conta única já conectada) tem id = 'default', que não é
-- um uuid válido. Antes de trocar o tipo da coluna, geramos um uuid de
-- verdade para ela (preservando os tokens/dados dessa conta) — sem isso o
-- ALTER COLUMN ... SET DATA TYPE uuid abaixo falharia contra o banco de
-- produção, que já tem essa linha.
UPDATE "mercadolivre_credentials" SET "id" = gen_random_uuid()::text WHERE "id" = 'default';--> statement-breakpoint
-- A coluna tem um DEFAULT em texto ('default'), e o Postgres se recusa a
-- converter esse default automaticamente pro tipo uuid (erro 42804: "default
-- for column id cannot be cast automatically to type uuid"). Por isso
-- removemos o default antes de trocar o tipo, e recriamos ele depois já como
-- gen_random_uuid().
ALTER TABLE "mercadolivre_credentials" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mercadolivre_credentials" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "mercadolivre_credentials" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "mercadolivre_credentials" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "mercadolivre_credentials" ADD CONSTRAINT "mercadolivre_credentials_ml_user_id_unique" UNIQUE("ml_user_id");
