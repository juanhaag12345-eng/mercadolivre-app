ALTER TABLE "stock_items" ADD COLUMN "sale_unit_type" text DEFAULT 'unitario' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "units_per_package" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "reference_cost_price" numeric(12, 2);