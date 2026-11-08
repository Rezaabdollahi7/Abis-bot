import {
  type CatalogProviderDto,
  type Patch,
  type ProductInput,
  type ProviderInput,
  type Toman,
  type VariantInput,
  toman,
} from '@abis/shared';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { Db, Executor } from '../../db/client.js';
import { recordAudit } from '../audit/index.js';
import { countAvailable } from '../stock/index.js';
import { products, providers, variants } from './schema.js';

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

/** A variant with its product and provider regardless of active flags (admin and orders). */
export async function getVariantWithProduct(
  db: Executor,
  variantId: number,
): Promise<{ variant: Variant; product: Product; provider: Provider } | undefined> {
  const [row] = await db
    .select({ variant: variants, product: products, provider: providers })
    .from(variants)
    .innerJoin(products, eq(variants.productId, products.id))
    .innerJoin(providers, eq(products.providerId, providers.id))
    .where(eq(variants.id, variantId));
  return (
    row && {
      variant: { ...row.variant, priceToman: toman(row.variant.priceToman) },
      product: row.product,
      provider: row.provider,
    }
  );
}

export function isOnSale(found: { variant: Variant; product: Product; provider: Provider }) {
  return found.variant.isActive && found.product.isActive && found.provider.isActive;
}

/** Bumps the sold counter shown on product cards. */
export async function addSold(exec: Executor, variantId: number, quantity: number) {
  await exec
    .update(variants)
    .set({ soldCount: sql`${variants.soldCount} + ${quantity}` })
    .where(eq(variants.id, variantId));
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
  db: Executor,
  input: typeof providers.$inferInsert,
): Promise<Provider> {
  const [row] = await db.insert(providers).values(input).returning();
  if (!row) throw new Error('createProvider: insert returned no row');
  return row;
}

export async function createProduct(
  db: Executor,
  input: typeof products.$inferInsert,
): Promise<Product> {
  const [row] = await db.insert(products).values(input).returning();
  if (!row) throw new Error('createProduct: insert returned no row');
  return row;
}

export async function createVariant(
  db: Executor,
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

/** The whole catalog for the admin panel, including inactive rows. */
export async function getFullCatalog(db: Db): Promise<CatalogProviderDto[]> {
  const [providerRows, productRows, variantRows] = await Promise.all([
    db.select().from(providers).orderBy(asc(providers.sortOrder), asc(providers.id)),
    db.select().from(products).orderBy(asc(products.sortOrder), asc(products.id)),
    db.select().from(variants).orderBy(asc(variants.durationDays), asc(variants.id)),
  ]);
  const productById = new Map(productRows.map((p) => [p.id, p]));
  const stockIds = variantRows
    .filter((v) => {
      const product = productById.get(v.productId);
      return product !== undefined && usesStock(product.deliveryMethod);
    })
    .map((v) => v.id);
  const available = await countAvailable(db, stockIds);

  return providerRows.map(({ createdAt: _p, ...provider }) => ({
    ...provider,
    products: productRows
      .filter((product) => product.providerId === provider.id)
      .map(({ createdAt: _c, ...product }) => ({
        ...product,
        variants: variantRows
          .filter((variant) => variant.productId === product.id)
          .map(({ createdAt: _v, ...variant }) => ({
            ...variant,
            stock: usesStock(product.deliveryMethod) ? (available.get(variant.id) ?? 0) : null,
          })),
      })),
  }));
}

/** Admin writes: each runs in a transaction together with its audit-log row. */
export const catalogAdmin = {
  createProvider: (db: Db, actor: number, input: ProviderInput) =>
    db.transaction(async (tx) => {
      const row = await createProvider(tx, input);
      await recordAudit(tx, audit(actor, 'provider.create', 'provider', row.id, input));
      return row;
    }),

  updateProvider: (db: Db, actor: number, id: number, patch: Patch<ProviderInput>) =>
    db.transaction(async (tx) => {
      const [row] = await tx.update(providers).set(patch).where(eq(providers.id, id)).returning();
      if (row) await recordAudit(tx, audit(actor, 'provider.update', 'provider', id, patch));
      return row;
    }),

  createProduct: (db: Db, actor: number, input: ProductInput) =>
    db.transaction(async (tx) => {
      const row = await createProduct(tx, input);
      await recordAudit(tx, audit(actor, 'product.create', 'product', row.id, input));
      return row;
    }),

  updateProduct: (db: Db, actor: number, id: number, patch: Patch<ProductInput>) =>
    db.transaction(async (tx) => {
      const [row] = await tx.update(products).set(patch).where(eq(products.id, id)).returning();
      if (row) await recordAudit(tx, audit(actor, 'product.update', 'product', id, patch));
      return row;
    }),

  createVariant: (db: Db, actor: number, input: VariantInput) =>
    db.transaction(async (tx) => {
      const row = await createVariant(tx, { ...input, priceToman: toman(input.priceToman) });
      await recordAudit(tx, audit(actor, 'variant.create', 'variant', row.id, input));
      return row;
    }),

  updateVariant: (db: Db, actor: number, id: number, patch: Patch<VariantInput>) =>
    db.transaction(async (tx) => {
      const [row] = await tx.update(variants).set(patch).where(eq(variants.id, id)).returning();
      if (row) await recordAudit(tx, audit(actor, 'variant.update', 'variant', id, patch));
      return row;
    }),
};

function audit(
  adminTelegramId: number,
  action: string,
  entityType: string,
  entityId: number,
  data: object,
) {
  return { adminTelegramId, action, entityType, entityId, data: { ...data } };
}
