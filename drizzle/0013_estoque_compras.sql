CREATE TABLE "stock_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"internal_code" serial NOT NULL,
	"name" text NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_items_internal_code_unique" UNIQUE("internal_code")
);
--> statement-breakpoint
CREATE TABLE "stock_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"purchase_date" date NOT NULL,
	"supplier" text NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"payment_method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "stock_item_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD CONSTRAINT "stock_purchases_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_items_name_idx" ON "stock_items" USING btree ("name");--> statement-breakpoint
CREATE INDEX "stock_purchases_item_idx" ON "stock_purchases" USING btree ("stock_item_id");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_stock_item_id_idx" ON "sales" USING btree ("stock_item_id");