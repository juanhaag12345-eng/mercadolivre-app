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

// Forma de pagamento de uma compra de mercadoria (aba Compras/estoque)
export const PAYMENT_METHODS = [
  "pix",
  "cartao_credito",
  "cartao_debito",
  "dinheiro",
  "boleto",
  "transferencia",
  "outro",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
};

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

// --- Estoque / Compras de mercadoria ---
//
// Item controlado por estoque — não é o mesmo cadastro da tabela `products`
// (que é o catálogo de vendas manuais/anúncios): esse aqui existe só para
// ligar compras de mercadoria a vendas do Mercado Livre (em /pendentes), já
// que uma venda do Mercado Livre não tem um "produto cadastrado" por trás
// (ver comentário em `sales.productNameSnapshot`). Cadastrado na aba
// Compras.
export const stockItems = pgTable(
  "stock_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Código interno sequencial (1, 2, 3...) — mesmo esquema do
    // `products.internalCode`, mas numa sequência própria e independente.
    internalCode: serial("internal_code").notNull().unique(),
    name: text("name").notNull(),
    // Estoque mínimo: quando o estoque atual (compras - vendas ligadas a
    // esse item) cai para esse nível ou menos, o item aparece como alerta
    // de reposição no dashboard e destacado na aba Compras.
    minStock: integer("min_stock").notNull().default(0),
    // Permite "aposentar" um item (ex: parou de vender) sem apagar o
    // histórico de compras/vendas já ligado a ele — itens inativos somem da
    // lista de seleção em /pendentes.
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("stock_items_name_idx").on(table.name)]
);

// Uma compra de mercadoria = entrada de estoque de um item, sempre
// registrada por unidade (preço pago e quantidade comprada).
export const stockPurchases = pgTable(
  "stock_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // onDelete "restrict": não deixa apagar um item de estoque que já tem
    // compra registrada (evita perder histórico) — use o campo `active`
    // acima pra aposentar o item em vez de excluir.
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "restrict" }),
    purchaseDate: date("purchase_date").notNull(),
    supplier: text("supplier").notNull(),
    // Preço de custo pago, sempre por unidade.
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull(),
    paymentMethod: text("payment_method", { enum: PAYMENT_METHODS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("stock_purchases_item_idx").on(table.stockItemId)]
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
    // ID do pagamento do Mercado Pago associado a esse pedido
    // (order.payments[0].id) — é por esse ID, não pelo order_id, que dá pra
    // consultar a liberação do dinheiro em GET /v1/payments/$id (ver
    // /liberacoes). Pedidos com mais de um pagamento (raro) só guardam o
    // primeiro.
    mlPaymentId: text("ml_payment_id"),
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

    // Vendedor (conta do Mercado Livre) a que essa venda pertence — necessário
    // desde que passou a ser possível conectar mais de uma conta, para saber
    // de qual conta usar o access_token na hora de consultar a liberação do
    // dinheiro (ver /liberacoes). Null em vendas manuais e em vendas do
    // Mercado Livre confirmadas antes dessa coluna existir.
    mlSellerId: text("ml_seller_id"),
    // Item de estoque escolhido em /pendentes na hora de confirmar a
    // entrada — usado para dar baixa no estoque (ver actions/stock.ts).
    // Null em vendas manuais e em vendas do Mercado Livre confirmadas antes
    // dessa coluna existir.
    stockItemId: uuid("stock_item_id").references(() => stockItems.id, {
      onDelete: "set null",
    }),
    // --- Liberação do dinheiro na conta do Mercado Livre (ver /liberacoes) ---
    // Preenchidos consultando a API de billing do Mercado Livre com o mesmo
    // access_token da venda — não é um valor calculado localmente. Ficam
    // null até a primeira consulta encontrar informação sobre essa venda.
    moneyReleaseDate: timestamp("money_release_date", { withTimezone: true }),
    moneyReleaseStatus: text("money_release_status"),
    // Quando a liberação dessa venda foi consultada pela última vez — usado
    // só para diagnóstico (saber se uma venda ficou "esquecida" sem nunca
    // ter sido verificada).
    moneyReleaseCheckedAt: timestamp("money_release_checked_at", { withTimezone: true }),

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
    index("sales_money_release_status_idx").on(table.moneyReleaseStatus),
    index("sales_stock_item_id_idx").on(table.stockItemId),
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

// Credenciais OAuth das contas vendedoras conectadas — uma linha por conta
// (o mesmo app pode ser autorizado por várias contas vendedoras diferentes,
// permitindo conectar mais de um vendedor do Mercado Livre ao mesmo
// aplicativo). O access_token dura ~6h; guardamos o refresh_token (que é
// rotativo — a cada uso o Mercado Livre devolve um novo) para renovar
// automaticamente sem precisar que alguém logue de novo. mlUserId é único:
// reconectar a mesma conta atualiza a linha existente em vez de duplicar.
export const mercadolivreCredentials = pgTable(
  "mercadolivre_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mlUserId: text("ml_user_id").notNull(),
    // Rótulo opcional pra distinguir as contas na tela de pendentes (ex.:
    // "Loja principal", "Loja do Djow"). Sem rótulo, mostramos só o ID do
    // vendedor.
    nickname: text("nickname"),
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
  },
  (table) => [
    unique("mercadolivre_credentials_ml_user_id_unique").on(table.mlUserId),
  ]
);

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
    // Vendedor (conta do Mercado Livre) dono desse pedido — propagado para
    // `sales.mlSellerId` na confirmação, pra saber depois de qual conta usar
    // o access_token ao consultar a liberação do dinheiro dessa venda.
    mlSellerId: text("ml_seller_id"),
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

// Conta de e-mail (Gmail) conectada para varredura automática de NF-e de
// fornecedores. Cada conta guarda seu próprio par de tokens OAuth — permite
// conectar as contas do Juan, do Djow e de mais e-mails no futuro, cada uma
// varrida de forma independente.
export const nfeEmailAccounts = pgTable("nfe_email_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"),
  // Guarda quando essa caixa foi varrida com sucesso pela última vez, só
  // para exibir na tela — a dedução de "e-mail novo" na varredura é sempre
  // feita pelo gmailMessageId já visto (tabela nfe_pendentes), não por data,
  // pra nunca perder um e-mail por causa de relógio/fuso.
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  lastScanError: text("last_scan_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Status de uma NF-e recebida por e-mail, aguardando (ou já passada por)
// conferência manual antes de virar compra de estoque de verdade.
export const NFE_PENDENTE_STATUSES = ["pendente", "aprovada", "rejeitada"] as const;
export type NfePendenteStatus = (typeof NFE_PENDENTE_STATUSES)[number];

// Um item de linha da NF-e, como veio do XML — ainda não ligado a nenhum
// item do estoque (isso só acontece na hora da aprovação manual).
export interface NfeItemParsed {
  codigoFornecedor: string;
  ean: string | null;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

// Uma NF-e (nota fiscal eletrônica) identificada num e-mail de fornecedor,
// com o XML já lido e estruturado — mas só é usada para dar baixa em compra
// de estoque de verdade depois que alguém confere e aprova em
// /notas-fiscais (mesmo espírito de /pendentes: nunca mexe em dado real
// sozinha).
export const nfePendentes = pgTable(
  "nfe_pendentes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailAccountId: uuid("email_account_id")
      .notNull()
      .references(() => nfeEmailAccounts.id, { onDelete: "cascade" }),
    // Evita processar o mesmo e-mail duas vezes entre varreduras.
    gmailMessageId: text("gmail_message_id").notNull().unique(),
    fornecedorCnpj: text("fornecedor_cnpj"),
    fornecedorNome: text("fornecedor_nome").notNull(),
    numeroNota: text("numero_nota"),
    serieNota: text("serie_nota"),
    dataEmissao: date("data_emissao"),
    valorTotal: numeric("valor_total", { precision: 12, scale: 2 }).notNull(),
    // Palpite de forma de pagamento a partir do campo <tPag> da NF-e — só
    // pré-preenche o formulário de aprovação, o usuário pode trocar.
    formaPagamentoSugerida: text("forma_pagamento_sugerida", {
      enum: PAYMENT_METHODS,
    }),
    itens: jsonb("itens").$type<NfeItemParsed[]>().notNull(),
    status: text("status", { enum: NFE_PENDENTE_STATUSES })
      .notNull()
      .default("pendente"),
    // Se o XML não é uma NF-e reconhecível ou algum item não deu pra ler
    // direito, guardamos o motivo aqui pra mostrar na tela em vez de
    // simplesmente sumir com o e-mail.
    erro: text("erro"),
    recebidaEm: timestamp("recebida_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processadaEm: timestamp("processada_em", { withTimezone: true }),
  },
  (table) => [index("nfe_pendentes_status_idx").on(table.status)]
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
export type NfeEmailAccount = typeof nfeEmailAccounts.$inferSelect;
export type NfePendente = typeof nfePendentes.$inferSelect;
