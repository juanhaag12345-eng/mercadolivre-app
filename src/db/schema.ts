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
  serial,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

// Tipos de taxa de venda: percentual (sobre o valor da venda) ou valor fixo
export const SALE_FEE_TYPES = ["percentual", "fixo"] as const;
export type SaleFeeType = (typeof SALE_FEE_TYPES)[number];

// Status possíveis do pedido
export const ORDER_STATUSES = ["pendente", "despachado"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Quem despachou a venda (sócios responsáveis pela operação)
export const DISPATCHERS = ["juan", "djow"] as const;
export type Dispatcher = (typeof DISPATCHERS)[number];
export const DISPATCHER_LABELS: Record<Dispatcher, string> = {
  juan: "Juan",
  djow: "Djow",
};

// De onde veio a venda: "manual" é o fluxo antigo (cadastro de produto com
// preço/taxa/frete configurados manualmente); "mercadolivre" é uma venda
// confirmada a partir de /pendentes, onde os valores de receita, tarifa de
// venda e frete já vêm prontos (reais) do Mercado Livre — não há "receita"
// configurável a aplicar, só o custo do produto é preenchido manualmente.
export const SALE_SOURCES = ["manual", "mercadolivre"] as const;
export type SaleSource = (typeof SALE_SOURCES)[number];

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Código interno sequencial (1, 2, 3...), na ordem em que os produtos
    // foram cadastrados. Não muda se o produto for editado ou renomeado —
    // serve para identificar o item de forma inequívoca em qualquer lugar
    // do site, mesmo quando nomes são parecidos (ex: duas variações de
    // "Nutella 650g").
    internalCode: serial("internal_code").notNull().unique(),
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

    // "manual" (cadastro de produto) ou "mercadolivre" (importada de /pendentes)
    source: text("source", { enum: SALE_SOURCES }).notNull().default("manual"),

    // Guardamos o nome no momento da venda (caso o produto seja excluído/renomeado
    // depois) — para vendas do Mercado Livre, é o título do anúncio.
    productNameSnapshot: text("product_name_snapshot").notNull(),

    // Rastreabilidade de volta ao pedido de origem no Mercado Livre (null
    // para vendas manuais).
    mlOrderId: text("ml_order_id"),
    mlPackId: text("ml_pack_id"),
    buyerNickname: text("buyer_nickname"),
    buyerFullName: text("buyer_full_name"),

    quantity: integer("quantity").notNull().default(1),
    saleDate: date("sale_date").notNull(),
    orderStatus: text("order_status", { enum: ORDER_STATUSES })
      .notNull()
      .default("pendente"),

    notes: text("notes"),

    // Sócio responsável por despachar essa venda
    dispatchedBy: text("dispatched_by", { enum: DISPATCHERS })
      .notNull()
      .default("juan"),

    // --- Snapshot da divisão de lucro vigente no momento da venda ---
    // Guardamos os percentuais usados (e não só o valor calculado) para que
    // alterar as configurações depois não mude retroativamente a divisão de
    // vendas já registradas — mesmo raciocínio do snapshot financeiro abaixo.
    operationalFeePercentSnapshot: numeric("operational_fee_percent_snapshot", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("5"),
    reservePercentSnapshot: numeric("reserve_percent_snapshot", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("30"),
    // % do lucro separado para igreja/doação, retirado antes de qualquer
    // outra divisão (reserva, remuneração operacional e sócios).
    donationPercentSnapshot: numeric("donation_percent_snapshot", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("10"),

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

    // --- Valores reais vindos do Mercado Livre (só quando source = "mercadolivre") ---
    // As colunas de snapshot acima reconstroem a receita/tarifas a partir de
    // uma "receita" configurável (preço unitário × qtd kit × taxa %) — isso
    // não existe para vendas do Mercado Livre, onde a tarifa de venda e o
    // frete já chegam prontos, como valores reais e totais. Por isso ficam
    // em colunas separadas, e withFinancials() usa essas direto (sem passar
    // por calculateFinancials) quando source = "mercadolivre".
    mlSaleFeeTotalSnapshot: numeric("ml_sale_fee_total_snapshot", {
      precision: 12,
      scale: 2,
    }),
    mlShippingTotalSnapshot: numeric("ml_shipping_total_snapshot", {
      precision: 12,
      scale: 2,
    }),
    // Custo TOTAL (não por unidade) da mercadoria dessa venda, preenchido
    // manualmente na tela de pendentes no momento da confirmação.
    productCostManualSnapshot: numeric("product_cost_manual_snapshot", {
      precision: 12,
      scale: 2,
    }),

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

// Configurações gerais da divisão de lucro entre os sócios (linha única,
// id fixo "default"). A doação é sempre a primeira fatia retirada do lucro;
// a reserva da empresa e a remuneração operacional de quem despacha são um
// percentual configurável do que sobra depois da doação; a divisão do que
// sobra entre os dois sócios é sempre 50/50.
export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("default"),
  operationalFeePercent: numeric("operational_fee_percent", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("5"),
  reservePercent: numeric("reserve_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("30"),
  // % do lucro separado para igreja/doação, retirado antes de qualquer
  // outra divisão.
  donationPercent: numeric("donation_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("10"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Integração com o Mercado Livre ---

// Credenciais OAuth da conta vendedora conectada (linha única, id fixo
// "default"). O access_token dura ~6h; guardamos o refresh_token (que é
// rotativo — a cada uso o Mercado Livre devolve um novo) para renovar
// automaticamente sem precisar que alguém logue de novo.
export const mercadolivreCredentials = pgTable("mercadolivre_credentials", {
  id: text("id").primaryKey().default("default"),
  mlUserId: text("ml_user_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Status de uma venda importada do Mercado Livre, aguardando revisão manual
// antes de virar uma venda "de verdade" no sistema.
export const PENDING_SALE_STATUSES = ["pendente", "confirmada", "ignorada"] as const;
export type PendingSaleStatus = (typeof PENDING_SALE_STATUSES)[number];

// Vendas pendentes de entrada: um item de um pedido do Mercado Livre,
// recebido via webhook (tópico orders_v2), aguardando que alguém confirme
// qual produto interno corresponde e quem despachou antes de entrar de fato
// no dashboard. Guardamos uma linha por ITEM do pedido (não por pedido),
// porque um mesmo pedido pode ter itens diferentes que mapeiam para
// produtos internos diferentes.
export const pendingSales = pgTable(
  "pending_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    mlOrderId: text("ml_order_id").notNull(),
    mlOrderItemId: text("ml_order_item_id").notNull(),
    // ID do "pack" do Mercado Livre (order.pack_id). A Central de Vendedores
    // do próprio Mercado Livre identifica a venda por esse número, não pelo
    // order_id — mesmo quando não há carrinho com itens de vendedores
    // diferentes, uma compra de uma unidade só já vem com pack_id preenchido.
    // Guardamos só para exibição, pra bater com o link que o vendedor abre
    // no site do Mercado Livre; null quando o Mercado Livre não retornar.
    mlPackId: text("ml_pack_id"),

    // Dados do pedido no momento em que recebemos/consultamos — apenas para
    // exibição na tela de revisão, não afetam o cálculo financeiro (que usa
    // sempre os dados cadastrados do produto interno escolhido).
    titleSnapshot: text("title_snapshot").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceSnapshot: numeric("unit_price_snapshot", { precision: 12, scale: 2 }).notNull(),
    // Taxa de venda (comissão do Mercado Livre) cobrada nesse item do pedido —
    // vem pronta na resposta da API (order_items[].sale_fee). Só para exibição
    // na revisão, não entra no cálculo financeiro da venda confirmada (que usa
    // a taxa cadastrada no produto interno).
    mlSaleFeeSnapshot: numeric("ml_sale_fee_snapshot", { precision: 12, scale: 2 }),
    // Custo de envio efetivamente cobrado do vendedor (vem de
    // /shipments/$id/costs → senders[].cost, não de "order.shipping" — esse
    // campo não existe mais na resposta de /orders). É por pedido, não por
    // item, então fica repetido nas linhas de pedidos com mais de um item.
    // Pode ter valor mesmo em pedidos com frete grátis pro comprador.
    mlShippingCostSnapshot: numeric("ml_shipping_cost_snapshot", { precision: 12, scale: 2 }),
    orderDate: timestamp("order_date", { withTimezone: true }).notNull(),
    orderStatusMl: text("order_status_ml").notNull(),
    buyerNickname: text("buyer_nickname"),
    // Nome real de quem recebe a encomenda — vem de
    // GET /shipments/$id?views=destination (header X-Api-Version: 2, campo
    // receiver_name). A API de /orders só devolve o id do comprador, nunca o
    // nome, por privacidade; o nome do destinatário do envio é o melhor
    // substituto disponível. Fica null quando o envio ainda não tem endereço
    // de destino processado.
    buyerFullName: text("buyer_full_name"),
    rawOrderPayload: jsonb("raw_order_payload"),

    status: text("status", { enum: PENDING_SALE_STATUSES }).notNull().default("pendente"),

    // Preenchidos pela pessoa na hora de confirmar a entrada da venda.
    // matchedProductId é do fluxo antigo (escolher um produto cadastrado) —
    // mantido na tabela só por compatibilidade com linhas antigas, mas não é
    // mais preenchido: a confirmação agora usa o título do anúncio direto.
    matchedProductId: uuid("matched_product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    // Custo TOTAL (não por unidade) da mercadoria dessa venda, preenchido
    // manualmente por quem confirma a entrada.
    productCostManual: numeric("product_cost_manual", { precision: 12, scale: 2 }),
    dispatchedBy: text("dispatched_by", { enum: DISPATCHERS }),

    // Venda real criada no momento da confirmação (referência só para
    // rastreabilidade — a venda em si vive só na tabela `sales`).
    resultingSaleId: uuid("resulting_sale_id").references(() => sales.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Evita duplicar o mesmo item de pedido se o webhook do ML entregar a
    // mesma notificação mais de uma vez (ele avisa que isso pode acontecer).
    unique("pending_sales_order_item_unique").on(table.mlOrderId, table.mlOrderItemId),
    index("pending_sales_status_idx").on(table.status),
  ]
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
export type MonthlyGoal = typeof monthlyGoals.$inferSelect;
export type AppSettings = typeof settings.$inferSelect;
export type MercadolivreCredentials = typeof mercadolivreCredentials.$inferSelect;
export type PendingSale = typeof pendingSales.$inferSelect;
export type NewPendingSale = typeof pendingSales.$inferInsert;
