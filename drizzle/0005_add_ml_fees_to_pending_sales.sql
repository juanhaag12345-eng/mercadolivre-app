ALTER TABLE "pending_sales" ADD COLUMN "ml_sale_fee_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "pending_sales" ADD COLUMN "ml_shipping_cost_snapshot" numeric(12, 2);