CREATE TABLE "mercadopago_manual_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ml_user_id" text NOT NULL,
	"tipo" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"descricao" text NOT NULL,
	"responsavel" text,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mercadopago_manual_transactions_ml_user_id_idx" ON "mercadopago_manual_transactions" USING btree ("ml_user_id");--> statement-breakpoint
CREATE INDEX "mercadopago_manual_transactions_created_at_idx" ON "mercadopago_manual_transactions" USING btree ("created_at");