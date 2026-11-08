import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedTestCatalog } from '../../test/fixtures.js';
import { useTestDb } from '../../test/db.js';
import {
  getVariantView,
  listFeaturedVariants,
  listProductVariants,
  listProviderProducts,
  listShopProviders,
} from './index.js';
import { variants } from './schema.js';

const getDb = useTestDb();

describe('shop catalog', () => {
  it('lists only active providers that have something to sell, in sort order', async () => {
    await seedTestCatalog(getDb());
    const names = (await listShopProviders(getDb())).map((p) => p.name);
    expect(names).toEqual(['OpenAI', 'Google']);
  });

  it('lists a provider’s products and a product’s variants by duration', async () => {
    const c = await seedTestCatalog(getDb());
    expect((await listProviderProducts(getDb(), c.openai.id)).map((p) => p.name)).toEqual([
      'ChatGPT Plus',
    ]);
    const durations = (await listProductVariants(getDb(), c.chatgpt.id)).map(
      (v) => v.variant.durationDays,
    );
    expect(durations).toEqual([30, 90]);
  });

  it('reports live stock for stock-based variants and null for email activation', async () => {
    const c = await seedTestCatalog(getDb());
    expect((await getVariantView(getDb(), c.gemini12m.id))?.stock).toBe(2);
    expect((await getVariantView(getDb(), c.chatgpt1m.id))?.stock).toBeNull();
  });

  it('hides inactive variants', async () => {
    const c = await seedTestCatalog(getDb());
    await getDb().update(variants).set({ isActive: false }).where(eq(variants.id, c.chatgpt3m.id));
    expect(await getVariantView(getDb(), c.chatgpt3m.id)).toBeUndefined();
  });

  it('paginates featured variants and clamps the page', async () => {
    await seedTestCatalog(getDb());
    const first = await listFeaturedVariants(getDb(), 1, 2);
    expect(first.totalPages).toBe(2);
    expect(first.items.map((v) => v.product.name)).toEqual(['ChatGPT Plus', 'ChatGPT Plus']);
    const beyond = await listFeaturedVariants(getDb(), 99, 2);
    expect(beyond.page).toBe(2);
    expect(beyond.items.map((v) => v.product.name)).toEqual(['Gemini Pro']);
  });
});
