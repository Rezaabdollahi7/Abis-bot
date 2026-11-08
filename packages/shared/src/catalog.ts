import { z } from 'zod';

// Admin catalog API: request schemas (validated on the server, reused by the panel forms).

export const deliveryMethods = ['link', 'ready_account', 'email_activation'] as const;
export type DeliveryMethod = (typeof deliveryMethods)[number];

export const requiredFieldNames = ['email', 'password', 'note'] as const;
export type RequiredFieldName = (typeof requiredFieldNames)[number];

export const providerInput = z.object({
  name: z.string().trim().min(1).max(64),
  emoji: z.string().trim().min(1).max(16),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export const productInput = z.object({
  providerId: z.number().int().positive(),
  name: z.string().trim().min(1).max(64),
  description: z.string().max(3000),
  deliveryMethod: z.enum(deliveryMethods),
  requiredFields: z.array(z.enum(requiredFieldNames)),
  warrantyDays: z.number().int().min(0),
  etaMinutes: z.number().int().positive().nullable(),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

export const variantInput = z.object({
  productId: z.number().int().positive(),
  durationDays: z.number().int().positive(),
  priceToman: z.number().int().positive(),
  isActive: z.boolean(),
});

/** Partial update body; keys sent as undefined are left unchanged. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export type ProviderInput = z.infer<typeof providerInput>;
export type ProductInput = z.infer<typeof productInput>;
export type VariantInput = z.infer<typeof variantInput>;

export interface CatalogVariantDto extends VariantInput {
  id: number;
  soldCount: number;
  /** null for email activation (no stock). */
  stock: number | null;
}
export interface CatalogProductDto extends ProductInput {
  id: number;
  variants: CatalogVariantDto[];
}
export interface CatalogProviderDto extends ProviderInput {
  id: number;
  products: CatalogProductDto[];
}
export interface CatalogResponse {
  providers: CatalogProviderDto[];
}

export interface StockItemDto {
  id: number;
  status: 'available' | 'sold';
  /** Masked first line, e.g. "https://…ab12". */
  preview: string;
  orderId: number | null;
  createdAt: string;
}

export const addStockInput = z.object({ text: z.string().min(1).max(100_000) });
