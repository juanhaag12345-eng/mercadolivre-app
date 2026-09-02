CREATE TABLE "settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"operational_fee_percent" numeric(5, 2) DEFAULT '5' NOT NULL,
	"reserve_percent" numeric(5, 2) DEFAULT '30' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "dispatched_by" text DEFAULT 'juan' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "operational_fee_percent_snapshot" numeric(5, 2) DEFAULT '5' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "reserve_percent_snapshot" numeric(5, 2) DEFAULT '30' NOT NULL;