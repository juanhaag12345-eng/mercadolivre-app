CREATE TABLE "monthly_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_month" text NOT NULL,
	"goal_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_goals_year_month_unique" UNIQUE("year_month")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"is_kit" boolean DEFAULT false NOT NULL,
	"kit_quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sale_fee_type" text DEFAULT 'percentual' NOT NULL,
	"sale_fee_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"free_shipping" boolean DEFAULT false NOT NULL,
	"shipping_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"packaging_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"product_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"product_name_snapshot" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sale_date" date NOT NULL,
	"order_status" text DEFAULT 'pendente' NOT NULL,
	"notes" text,
	"unit_price_snapshot" numeric(12, 2) NOT NULL,
	"kit_quantity_snapshot" integer NOT NULL,
	"sale_fee_type_snapshot" text NOT NULL,
	"sale_fee_value_snapshot" numeric(12, 2) NOT NULL,
	"free_shipping_snapshot" boolean NOT NULL,
	"shipping_cost_snapshot" numeric(12, 2) NOT NULL,
	"packaging_cost_snapshot" numeric(12, 2) NOT NULL,
	"product_cost_snapshot" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sales_product_id_idx" ON "sales" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sales_sale_date_idx" ON "sales" USING btree ("sale_date");--> statement-breakpoint
CREATE INDEX "sales_order_status_idx" ON "sales" USING btree ("order_status");