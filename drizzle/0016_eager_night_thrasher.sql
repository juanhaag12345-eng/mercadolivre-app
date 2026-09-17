ALTER TABLE "stock_items" ADD COLUMN "ean" text;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "criado_automaticamente" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD COLUMN "origem" text DEFAULT 'sem_nf' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD COLUMN "nota_fiscal_numero" text;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD COLUMN "nfe_pendente_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD COLUMN "produto_novo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD COLUMN "payment_term_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD COLUMN "payment_status" text DEFAULT 'pendente' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD COLUMN "observacao" text;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD CONSTRAINT "stock_purchases_nfe_pendente_id_nfe_pendentes_id_fk" FOREIGN KEY ("nfe_pendente_id") REFERENCES "public"."nfe_pendentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_purchases_payment_status_idx" ON "stock_purchases" USING btree ("payment_status");