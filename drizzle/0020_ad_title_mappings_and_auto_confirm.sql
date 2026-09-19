CREATE TABLE "ad_title_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_title" text NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_title_mappings_ad_title_unique" UNIQUE("ad_title")
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "auto_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "dispatched_by_confirmed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_title_mappings" ADD CONSTRAINT "ad_title_mappings_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE cascade ON UPDATE no action;