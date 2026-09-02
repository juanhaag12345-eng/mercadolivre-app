import { z } from "zod";
import { DISPATCHERS, ORDER_STATUSES, SALE_FEE_TYPES } from "@/db/schema";

export const productSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do produto"),
  imageUrl: z.string().trim().url("URL inválida").optional().or(z.literal("")),
  isKit: z.boolean(),
  kitQuantity: z.coerce.number().int().min(1, "Mínimo 1"),
  unitPrice: z.coerce.number().min(0, "Não pode ser negativo"),
  saleFeeType: z.enum(SALE_FEE_TYPES),
  saleFeeValue: z.coerce.number().min(0, "Não pode ser negativo"),
  freeShipping: z.boolean(),
  shippingCost: z.coerce.number().min(0, "Não pode ser negativo"),
  packagingCost: z.coerce.number().min(0, "Não pode ser negativo"),
  productCost: z.coerce.number().min(0, "Não pode ser negativo"),
  active: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productSchema>;

export const saleSchema = z.object({
  productId: z.string().uuid("Selecione um produto"),
  quantity: z.coerce.number().int().min(1, "Mínimo 1"),
  saleDate: z.string().min(1, "Informe a data"),
  orderStatus: z.enum(ORDER_STATUSES),
  dispatchedBy: z.enum(DISPATCHERS, { message: "Selecione quem despachou" }),
  notes: z.string().trim().optional().or(z.literal("")),
  // Overrides opcionais — se vazios, usamos o valor cadastrado do produto
  unitPriceOverride: z.coerce.number().min(0).optional(),
  shippingCostOverride: z.coerce.number().min(0).optional(),
  packagingCostOverride: z.coerce.number().min(0).optional(),
  productCostOverride: z.coerce.number().min(0).optional(),
});

export type SaleFormValues = z.infer<typeof saleSchema>;

export const goalSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  goalValue: z.coerce.number().min(0),
});

export const settingsSchema = z.object({
  operationalFeePercent: z.coerce.number().min(0).max(100),
  reservePercent: z.coerce.number().min(0).max(100),
});
