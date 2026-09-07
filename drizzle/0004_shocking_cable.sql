CREATE TABLE "mercadolivre_credentials" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"ml_user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ml_order_id" text NOT NULL,
	"ml_order_item_id" text NOT NULL,
	"title_snapshot" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_snapshot" numeric(12, 2) NOT NULL,
	"order_date" timestamp with time zone NOT NULL,
	"order_status_ml" text NOT NULL,
	"buyer_nickname" text,
	"raw_order_payload" jsonb,
	"status" text DEFAULT 'pendente' NOT NULL,
	"matched_product_id" uuid,
	"dispatched_by" text,
	"resulting_sale_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_sales_order_item_unique" UNIQUE("ml_order_id","ml_order_item_id")
);
--> statement-breakpoint
ALTER TABLE "pending_sales" ADD CONSTRAINT "pending_sales_matched_product_id_products_id_fk" FOREIGN KEY ("matched_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_sales" ADD CONSTRAINT "pending_sales_resulting_sale_id_sales_id_fk" FOREIGN KEY ("resulting_sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_sales_status_idx" ON "pending_sales" USING btree ("status");