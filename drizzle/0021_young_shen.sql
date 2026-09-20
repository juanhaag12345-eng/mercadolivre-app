CREATE TABLE "mercadopago_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ml_user_id" text NOT NULL,
	"baseline_amount" numeric(12, 2) NOT NULL,
	"baseline_date" date NOT NULL,
	"current_estimate" numeric(12, 2) NOT NULL,
	"last_synced_through_date" date NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_summary" text,
	"pending_report_id" text,
	"pending_report_period_start" date,
	"pending_report_period_end" date,
	"pending_report_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mercadopago_balances_ml_user_id_unique" UNIQUE("ml_user_id")
);
