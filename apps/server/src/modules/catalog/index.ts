import { type Toman, toman } from '@abis/shared';
import { and, asc, count, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { countAvailable } from '../stock/index.js';
import { products, providers, variants } from './schema.js';

export type { RequiredField } from './schema.js';
export type Provider = typeof providers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type DeliveryMethod = Product['deliveryMethod'];
export type Variant = Omit<typeof variants.$inferSelect, 'priceToman'> & { priceToman: Toman };

/** A variant as the shop shows it, with its product, provider and live stock. */
export interface VariantView {
  variant: Variant;
  product: Product;
  provider: Provider;
  /** Available stock items; `null` for email activation, which never uses stock. */
  stock: number | null;
}

export function usesStock(method: DeliveryMethod): boolean {
  return method !== 'email_activation';
}

// ── Shop (read side): only active rows whose parents are active too ──────────

const visible = and(
  eq(providers.isActive, true),
  eq(products.isActive, true),
  eq(variants.isActive, true),
);

export async function listShopProviders(db: Db): Promise<Provider[]> {
  return db
    .selectDistinct({ provider: providers })
    .from(providers)
    .innerJoin(products, eq(products.providerId, providers.id))
    .innerJoin(variants, eq(variants.productId, products.id))
    .where(visible)
    .orderBy(asc(providers.sortOrder), asc(providers.id))
    .then((rows) => rows.map((row) => row.provider));
}

export async function listProviderProducts(db: Db, providerId: number): Promise<Product[]> {
  return db
    .selectDistinct({ product: products })
    .from(products)
    .innerJoin(providers, eq(products.providerId, providers.id))
    .innerJoin(variants, eq(variants.productId, products.id))
    .where(and(visible, eq(providers.id, providerId)))
    .orderBy(asc(products.sortOrder), asc(products.id))
    .then((rows) => rows.map((row) => row.product));
}

export async function listProductVariants(db: Db, productId: number): Promise<VariantView[]> {
  return withStock(db, await selectViews(db).where(and(visible, eq(products.id, productId))));
}

export async function getVariantView(db: Db, variantId: number): Promise<VariantView | undefined> {
  const views = await withStock(
    db,
    await selectViews(db).where(and(visible, eq(variants.id, variantId))),
  );
  return views[0];
}

/** Variants of featured products for the shop front page, paginated. */
export async function listFeaturedVariants(
  db: Db,
  page: number,
  pageSize: number,
): Promise<{ items: VariantView[]; page: number; totalPages: number }> {
  const where = and(visible, eq(products.isFeatured, true));
  const [total] = await db
    .select({ n: count() })
    .from(variants)
    .innerJoin(products, eq(variants.productId, products.id))
    .innerJoin(providers, eq(products.providerId, providers.id))
    .where(where);
  const totalPages = Math.max(1, Math.ceil((total?.n ?? 0) / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const rows = await selectViews(db)
    .where(where)
    .limit(pageSize)
    .offset((current - 1) * pageSize);
  return { items: await withStock(db, rows), page: current, totalPages };
}

function selectViews(db: Db) {
  const query = db
    .select({ variant: variants, product: products, provider: providers })
    .from(variants)
    .innerJoin(products, eq(variants.productId, products.id))
    .innerJoin(providers, eq(products.providerId, providers.id))
    .$dynamic();
  return {
    where: (condition: ReturnType<typeof and>) =>
      query
        .where(condition)
        .orderBy(
          asc(providers.sortOrder),
          asc(products.sortOrder),
          asc(products.id),
          asc(variants.durationDays),
        ),
  };
}

async function withStock(
  db: Db,
  rows: { variant: typeof variants.$inferSelect; product: Product; provider: Provider }[],
): Promise<VariantView[]> {
  const stockIds = rows
    .filter((row) => usesStock(row.product.deliveryMethod))
    .map((row) => row.variant.id);
  const available = await countAvailable(db, stockIds);
  return rows.map(({ variant, product, provider }) => ({
    variant: { ...variant, priceToman: toman(variant.priceToman) },
    product,
    provider,
    stock: usesStock(product.deliveryMethod) ? (available.get(variant.id) ?? 0) : null,
  }));
}

// ── Admin (write side) ────────────────────────────────────────────────────────

export async function createProvider(
  db: Db,
  input: typeof providers.$inferInsert,
): Promise<Provider> {
  const [row] = await db.insert(providers).values(input).returning();
  if (!row) throw new Error('createProvider: insert returned no row');
  return row;
}

export async function createProduct(db: Db, input: typeof products.$inferInsert): Promise<Product> {
  const [row] = await db.insert(products).values(input).returning();
  if (!row) throw new Error('createProduct: insert returned no row');
  return row;
}

export async function createVariant(
  db: Db,
  input: Omit<typeof variants.$inferInsert, 'priceToman'> & { priceToman: Toman },
): Promise<Variant> {
  const [row] = await db.insert(variants).values(input).returning();
  if (!row) throw new Error('createVariant: insert returned no row');
  return { ...row, priceToman: toman(row.priceToman) };
}

export async function hasAnyProvider(db: Db): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(providers);
  return (row?.n ?? 0) > 0;
}
