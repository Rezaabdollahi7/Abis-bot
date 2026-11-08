import type { StockItemDto } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { adminClient } from '../test/api.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';

const getDb = useTestDb();

describe('stock API', () => {
  it('adds a bulk paste, lists masked items and removes an unsold one', async () => {
    const c = await seedTestCatalog(getDb());
    const api = adminClient(getDb());
    const added = await api.send('POST', `/variants/${c.gemini12m.id}/stock`, {
      text: 'https://new.example/link/0001\nhttps://new.example/link/0002',
    });
    expect(await added.json()).toEqual({ added: 2 });

    const items = (await (
      await api.get(`/variants/${c.gemini12m.id}/stock`)
    ).json()) as StockItemDto[];
    expect(items).toHaveLength(5);
    expect(JSON.stringify(items)).not.toContain('new.example/link/0001');

    const first = items[0];
    if (!first) throw new Error('missing');
    expect((await api.delete(`/stock/${first.id}`)).status).toBe(204);
    expect((await api.delete(`/stock/${first.id}`)).status).toBe(404);
  });

  it('explains why email-activation variants have no stock', async () => {
    const c = await seedTestCatalog(getDb());
    const res = await adminClient(getDb()).send('POST', `/variants/${c.chatgpt1m.id}/stock`, {
      text: 'x',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ message: 'محصولات فعال‌سازی روی ایمیل انبار ندارند' });
  });
});
