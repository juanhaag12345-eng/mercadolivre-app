import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";

// Tipos de taxa de venda: percentual (sobre o valor da venda) ou valor fixo
export const SALE_FEE_TYPES = ["percentual", "fixo"] as const;
export type SaleFeeType = (typeof SALE_FEE_TYPES)[number];

// Status possíveis do pedido
export const ORDER_STATUSES = ["pendente", "despachado"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),

    // Kit
    isKit: boolean("is_kit").notNull().default(false),
    kitQuantity: integer("kit_quantity").notNull().default(1),

    // Preço de venda por unidade (sempre preenchido pelo usuário)
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),

    // Taxa de venda do Mercado Livre
    saleFeeType: text("sale_fee_type", { enum: SALE_FEE_TYPES })
      .notNull()
      .default("percentual"),
    saleFeeValue: numeric("sale_fee_value", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),

    // Frete
    freeShipping: boolean("free_shipping").notNull().default(false),
    shippingCost: numeric("shipping_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),

    // Custos (sempre por unidade do produto, multiplicados pela qtd do kit)
    packagingCost: numeric("packaging_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    productCost: numeric("product_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),

    active: boolean("active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("products_name_idx").on(table.name)]
);

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),

    // Guardamos o nome no momento da venda (caso o produto seja excluído/renomeado depois)
    productNameSnapshot: text("product_name_snapshot").notNull(),

    quantity: integer("quantity").notNull().default(1),
    saleDate: date("sale_date").notNull(),
    orderStatus: text("order_status", { enum: ORDER_STATUSES })
      .notNull()
      .default("pendente"),

    notes: text("notes"),

    // --- Snapshot dos valores financeiros do produto no momento da venda ---
    // Isso garante que editar o cadastro do produto depois não altere o
    // lucro/margem de vendas já registradas.
    unitPriceSnapshot: numeric("unit_price_snapshot", {
      precision: 12,
      scale: 2,
    }).notNull(),
    kitQuantitySnapshot: integer("kit_quantity_snapshot").notNull(),
    saleFeeTypeSnapshot: text("sale_fee_type_snapshot", {
      enum: SALE_FEE_TYPES,
    }).notNull(),
    saleFeeValueSnapshot: numeric("sale_fee_value_snapshot", {
      precision: 12,
      scale: 2,
    }).notNull(),
    freeShippingSnapshot: boolean("free_shipping_snapshot").notNull(),
    shippingCostSnapshot: numeric("shipping_cost_snapshot", {
      precision: 12,
      scale: 2,
    }).notNull(),
    packagingCostSnapshot: numeric("packaging_cost_snapshot", {
      precision: 12,
      scale: 2,
    }).notNull(),
    productCostSnapshot: numeric("product_cost_snapshot", {
      precision: 12,
      scale: 2,
    }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sales_product_id_idx").on(table.productId),
    index("sales_sale_date_idx").on(table.saleDate),
    index("sales_order_status_idx").on(table.orderStatus),
  ]
);

// Meta de faturamento mensal, uma linha por mês (formato "YYYY-MM")
export const monthlyGoals = pgTable("monthly_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  yearMonth: text("year_month").notNull().unique(),
  goalValue: numeric("goal_value", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
export type MonthlyGoal = typeof monthlyGoals.$inferSelect;
