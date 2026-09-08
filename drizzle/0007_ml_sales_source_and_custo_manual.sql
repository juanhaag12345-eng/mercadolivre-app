ALTER TABLE "pending_sales" ADD COLUMN "buyer_full_name" text;--> statement-breakpoint
ALTER TABLE "pending_sales" ADD COLUMN "product_cost_manual" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "ml_order_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "ml_pack_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "buyer_nickname" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "buyer_full_name" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "ml_sale_fee_total_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "ml_shipping_total_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "product_cost_manual_snapshot" numeric(12, 2);