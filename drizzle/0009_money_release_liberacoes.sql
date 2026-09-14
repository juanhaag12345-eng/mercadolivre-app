ALTER TABLE "pending_sales" ADD COLUMN "ml_seller_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "ml_seller_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "money_release_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "money_release_status" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "money_release_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "sales_money_release_status_idx" ON "sales" USING btree ("money_release_status");