import type { CatalogResponse } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { listRecentAudit } from '../modules/audit/index.js';
import { listShopProviders } from '../modules/catalog/index.js';
import { TEST_OWNER_ID, adminClient } from '../test/api.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';

const getDb = useTestDb();
const OWNER = TEST_OWNER_ID;
const client = () => adminClient(getDb());

describe('catalog admin API', () => {
  it('returns the full tree including inactive rows and stock', async () => {
    await seedTestCatalog(getDb());
    const body = (await (await client().get('/catalog')).json()) as CatalogResponse;
    expect(body.providers.map((p) => p.name)).toEqual(['Hidden', 'OpenAI', 'Google']);
    const gemini = body.providers.find((p) => p.name === 'Google')?.products[0];
    expect(gemini?.variants[0]).toMatchObject({ durationDays: 360, stock: 2 });
    const chatgpt = body.providers.find((p) => p.name === 'OpenAI')?.products[0];
    expect(chatgpt?.variants[0]?.stock).toBeNull();
  });

  it('creates a provider → product → variant chain that appears in the shop', async () => {
    const api = client();
    const provider = (await (
      await api.send('POST', '/providers', {
        name: 'Anthropic',
        emoji: '🟠',
        sortOrder: 1,
        isActive: true,
      })
    ).json()) as { id: number };
    const product = (await (
      await api.send('POST', '/products', {
        providerId: provider.id,
        name: 'Claude Pro',
        description: '',
        deliveryMethod: 'email_activation',
        requiredFields: ['email'],
        warrantyDays: 30,
        etaMinutes: 60,
        isFeatured: true,
        isActive: true,
        sortOrder: 0,
      })
    ).json()) as { id: number };
    const variant = await api.send('POST', '/variants', {
      productId: product.id,
      durationDays: 30,
      priceToman: 1_600_000,
      isActive: true,
    });
    expect(variant.status).toBe(201);
    expect((await listShopProviders(getDb())).map((p) => p.name)).toEqual(['Anthropic']);
  });

  it('updates a price and writes an audit row with the admin', async () => {
    const c = await seedTestCatalog(getDb());
    const res = await client().send('PATCH', `/variants/${c.chatgpt1m.id}`, {
      priceToman: 900_000,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ priceToman: 900_000 });
    const [entry] = await listRecentAudit(getDb(), 1);
    expect(entry).toMatchObject({
      adminTelegramId: OWNER,
      action: 'variant.update',
      entityId: c.chatgpt1m.id,
      data: { priceToman: 900_000 },
    });
  });

  it('rejects invalid input and unknown ids', async () => {
    const api = client();
    const bad = await api.send('POST', '/variants', { productId: 1, durationDays: 30 });
    expect(bad.status).toBe(400);
    const fractional = await api.send('PATCH', '/variants/1', { priceToman: 1.5 });
    expect(fractional.status).toBe(400);
    const missing = await api.send('PATCH', '/providers/999', { name: 'X' });
    expect(missing.status).toBe(404);
  });
});
