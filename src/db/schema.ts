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

// De onde veio uma compra de mercadoria: via nota fiscal recebida por
// e-mail (aprovada em /notas-fiscais) ou cadastrada manualmente (aba
// Compras) sem nota — permite comparar preço pago com e sem NF do mesmo
// item.
export const PURCHASE_ORIGINS = ["nf", "sem_nf"] as const;
export type PurchaseOrigin = (typeof PURCHASE_ORIGINS)[number];
export const PURCHASE_ORIGIN_LABELS: Record<PurchaseOrigin, string> = {
  nf: "Com NF",
  sem_nf: "Sem NF",
};

// Status de pagamento de uma compra — só o suficiente para saber o que
// ainda precisa ser pago, sem virar um sistema financeiro completo.
export const PAYMENT_STATUSES = ["pendente", "pago"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
};

// Como um item de estoque é comprado/vendido: sempre por unidade, ou em
// pacotes fixos (display, conjunto ou caixa) — quando não é "unitario", o
// preço de custo é digitado pelo pacote inteiro e convertido pra um preço
// de referência por unidade (ver lib/product-pricing.ts). O controle de
// estoque em si (compras, vendas, alerta de estoque mínimo) continua
// sempre contando em unidades, nunca em pacotes.
export const SALE_UNIT_TYPES = ["unitario", "display", "conjunto", "caixa"] as const;
export type SaleUnitType = (typeof SALE_UNIT_TYPES)[number];
export const SALE_UNIT_TYPE_LABELS: Record<SaleUnitType, string> = {
  unitario: "Unitário",
  display: "Display",
  conjunto: "Conjunto",
  caixa: "Caixa",
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
    // Código interno sequencial (1, 2, 3...) — gerenciado pela aplicação (não
    // é mais `serial`/sequência do Postgres) porque, ao excluir um item, os
    // códigos dos itens seguintes são renumerados pra fechar o buraco (ex:
    // excluir o #1 faz o #2 virar #1) — uma sequência do Postgres nunca
    // reutiliza nem reordena números, então não daria pra fazer isso com ela.
    internalCode: integer("internal_code").notNull().unique(),
    name: text("name").notNull(),
    // Código de barras (EAN/GTIN) do produto, quando conhecido — usado para
    // identificar automaticamente esse item nos itens de uma NF-e recebida
    // por e-mail, sem depender do nome bater exatamente.
    ean: text("ean"),
    // Estoque mínimo: quando o estoque atual (compras - vendas ligadas a
    // esse item) cai para esse nível ou menos, o item aparece como alerta
    // de reposição no dashboard e destacado na aba Compras.
    minStock: integer("min_stock").notNull().default(0),
    // Como esse item é comprado/vendido — ver SALE_UNIT_TYPES acima.
    saleUnitType: text("sale_unit_type", { enum: SALE_UNIT_TYPES }).notNull().default("unitario"),
    // Quantas unidades vêm em 1 display/conjunto/caixa — irrelevante (fica
    // 1) quando saleUnitType é "unitario".
    unitsPerPackage: integer("units_per_package").notNull().default(1),
    // Preço de custo de referência pro cadastro, sempre por unidade — é só
    // uma referência (pré-preenche o formulário de compra), não substitui o
    // histórico de preços de compra de verdade em stock_purchases.
    referenceCostPrice: numeric("reference_cost_price", { precision: 12, scale: 2 }),
    // Marca um item criado automaticamente (sem intervenção manual) a
    // partir de um item de NF-e não reconhecido — fica com essa marca até
    // alguém revisar o cadastro e dispensar o aviso "PRODUTO NOVO".
    criadoAutomaticamente: boolean("criado_automaticamente").notNull().default(false),
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
    // "nf" quando essa compra veio de uma NF-e aprovada em /notas-fiscais;
    // "sem_nf" quando foi cadastrada manualmente aqui em Compras. Todo
    // registro criado pelo formulário de Compras é sempre "sem_nf" — o
    // fluxo de NF-e é o único que grava "nf".
    origem: text("origem", { enum: PURCHASE_ORIGINS }).notNull().default("sem_nf"),
    // Preenchidos só quando origem = "nf" — número da nota e referência de
    // volta à pendência de NF-e que originou essa compra (pra permitir, no
    // futuro, voltar no XML original a partir do histórico de compras).
    notaFiscalNumero: text("nota_fiscal_numero"),
    nfePendenteId: uuid("nfe_pendente_id").references(() => nfePendentes.id, {
      onDelete: "set null",
    }),
    // Marca que essa compra foi a responsável por criar um item de estoque
    // novo automaticamente (item de NF-e sem correspondência conhecida) —
    // não muda com o tempo, é só um registro histórico de que aquele item
    // surgiu sozinho, pra mostrar "PRODUTO NOVO" no histórico de compras.
    produtoNovo: boolean("produto_novo").notNull().default(false),
    // Prazo de pagamento em dias a partir da data da compra (0 = à vista).
    // dueDate é calculado uma vez na hora do cadastro (purchaseDate +
    // paymentTermDays) e guardado pronto — evita recalcular com fuso
    // horário toda vez que a tela lista pagamentos próximos.
    paymentTermDays: integer("payment_term_days").notNull().default(0),
    dueDate: date("due_date"),
    paymentStatus: text("payment_status", { enum: PAYMENT_STATUSES })
      .notNull()
      .default("pendente"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    observacao: text("observacao"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("stock_purchases_item_idx").on(table.stockItemId),
    index("stock_purchases_payment_status_idx").on(table.paymentStatus),
  ]
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
    // true quando essa venda foi confirmada sozinha pelo sistema (a partir de
    // um vínculo anúncio→produto já memorizado em ad_title_mappings), sem
    // ninguém olhar em Pendentes — usado pra listar "confirmadas
    // automaticamente" em /pendentes pra conferência. false = confirmada
    // manualmente (fluxo de sempre).
    autoConfirmed: boolean("auto_confirmed").notNull().default(false),
    // Numa confirmação automática não tem como saber quem realmente vai
    // despachar o pacote — dispatchedBy acima entra com um valor provisório
    // (ATENÇÃO: entra valendo pro rateio operacional de 5% até ser corrigido)
    // e essa coluna fica false até alguém escolher de verdade na lista de
    // "confirmadas automaticamente" em /pendentes. Confirmação manual sempre
    // grava true, porque a pessoa já escolhe quem despachou na hora.
    dispatchedByConfirmed: boolean("dispatched_by_confirmed").notNull().default(true),

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

// Vínculo memorizado "título do anúncio → produto de estoque", usado pra
// confirmar sozinha (sem passar por revisão manual em Pendentes) uma venda
// nova cujo anúncio já apareceu antes. Só é criado/atualizado quando uma
// PESSOA confirma manualmente uma venda pendente daquele título — nunca por
// adivinhação de texto (ver comentário em tryAutoConfirmPendingSale, em
// lib/mercadolivre.ts) — então o pior caso é repetir uma escolha que o Juan
// ou o Djow já fizeram antes, nunca inventar uma nova. Confirmar de novo,
// manualmente, uma venda do mesmo título com um produto diferente substitui
// o vínculo (corrige um mapeamento errado pra frente, sem mexer em vendas
// já lançadas).
export const adTitleMappings = pgTable(
  "ad_title_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adTitle: text("ad_title").notNull(),
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("ad_title_mappings_ad_title_unique").on(table.adTitle)]
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
    // XML bruto do anexo, guardado pra permitir baixar a nota original na
    // tela (notas de antes dessa coluna existir ficam com null aqui — o
    // botão de download simplesmente não aparece pra elas).
    xmlConteudo: text("xml_conteudo"),
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

// Saldo estimado da carteira Mercado Pago de cada conta conectada — não dá
// pra ler um "saldo agora" pronto da API, então guardamos um ponto de
// partida (que o usuário informa olhando o app do Mercado Pago) e vamos
// somando por cima: toda vez que uma venda passa a "released" (ver
// sales.moneyReleaseStatus) somamos o netAmount dela, e a cada sincronização
// buscamos na Mercado Pago (relatório de liquidação) os saques e
// estornos/ajustes que não aparecem em `sales` pra também entrar na conta.
// Por isso o valor é sempre uma ESTIMATIVA "a partir da última
// sincronização", nunca um número em tempo real ao segundo.
export const mercadopagoBalances = pgTable("mercadopago_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  mlUserId: text("ml_user_id").notNull(),
  // Saldo informado manualmente pelo usuário (olhando o app do Mercado
  // Pago) e a data em que ele valia — ponto de partida da conta corrente.
  // Reiniciar (botão "corrigir saldo") só atualiza estes dois campos e some
  // currentEstimate = baselineAmount, lastSyncedThroughDate = baselineDate.
  baselineAmount: numeric("baseline_amount", { precision: 12, scale: 2 }).notNull(),
  baselineDate: date("baseline_date").notNull(),
  // Valor calculado: baseline + tudo que entrou/saiu desde então.
  currentEstimate: numeric("current_estimate", { precision: 12, scale: 2 }).notNull(),
  // Até que dia (inclusive) já somamos os saques/ajustes da Mercado Pago —
  // a próxima sincronização busca o relatório a partir do dia seguinte.
  lastSyncedThroughDate: date("last_synced_through_date").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  // Texto curto pra exibir na tela o que entrou na última sincronização
  // (ex.: "2 saque(s): -R$ 429,90 · sem estornos"), sem precisar guardar
  // linha a linha do relatório da Mercado Pago.
  lastSyncSummary: text("last_sync_summary"),
  // Preenchido enquanto o relatório de liquidação está sendo gerado do lado
  // da Mercado Pago (é assíncrono, pode levar minutos) — permite retomar a
  // sincronização numa tentativa seguinte em vez de pedir um relatório novo
  // a cada clique.
  pendingReportId: text("pending_report_id"),
  pendingReportPeriodStart: date("pending_report_period_start"),
  pendingReportPeriodEnd: date("pending_report_period_end"),
  pendingReportRequestedAt: timestamp("pending_report_requested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [unique("mercadopago_balances_ml_user_id_unique").on(table.mlUserId)]);

export type MercadopagoBalance = typeof mercadopagoBalances.$inferSelect;

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
export type StockItem = typeof stockItems.$inferSelect;
export type StockPurchase = typeof stockPurchases.$inferSelect;
export type AdTitleMapping = typeof adTitleMappings.$inferSelect;
