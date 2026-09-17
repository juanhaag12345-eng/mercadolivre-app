CREATE TABLE "nfe_email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"last_scanned_at" timestamp with time zone,
	"last_scan_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_email_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "nfe_pendentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_account_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"fornecedor_cnpj" text,
	"fornecedor_nome" text NOT NULL,
	"numero_nota" text,
	"serie_nota" text,
	"data_emissao" date,
	"valor_total" numeric(12, 2) NOT NULL,
	"forma_pagamento_sugerida" text,
	"itens" jsonb NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"erro" text,
	"recebida_em" timestamp with time zone DEFAULT now() NOT NULL,
	"processada_em" timestamp with time zone,
	CONSTRAINT "nfe_pendentes_gmail_message_id_unique" UNIQUE("gmail_message_id")
);
--> statement-breakpoint
ALTER TABLE "nfe_pendentes" ADD CONSTRAINT "nfe_pendentes_email_account_id_nfe_email_accounts_id_fk" FOREIGN KEY ("email_account_id") REFERENCES "public"."nfe_email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nfe_pendentes_status_idx" ON "nfe_pendentes" USING btree ("status");