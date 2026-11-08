import { describe, expect, it } from 'vitest';
import { testCipher } from '../../test/cipher.js';
import { useTestDb } from '../../test/db.js';
import { seedTestCatalog } from '../../test/fixtures.js';
import { listRecentAudit } from '../audit/index.js';
import {
  StockError,
  addStock,
  countAvailable,
  listStock,
  mask,
  removeStockItem,
  splitBulk,
} from './index.js';
import { stockItems } from './schema.js';

const getDb = useTestDb();

describe('splitBulk', () => {
  it('takes links one per line, ignoring blanks', () => {
    expect(splitBulk('https://a\n\n https://b \r\nhttps://c', 'link')).toEqual([
      'https://a',
      'https://b',
      'https://c',
    ]);
  });
  it('keeps multi-line ready accounts together, split by blank lines', () => {
    expect(splitBulk('a@x.com\npass1\n\nb@x.com\npass2\n', 'ready_account')).toEqual([
      'a@x.com\npass1',
      'b@x.com\npass2',
    ]);
  });
});

describe('stock', () => {
  it('stores items encrypted, counts them and lists masked previews', async () => {
    const c = await seedTestCatalog(getDb());
    const added = await addStock(getDb(), testCipher, {
      variantId: c.gemini12m.id,
      text: 'https://one.example/activate/abcd1234\nhttps://two.example/activate/efgh5678',
      actor: 1,
    });
    expect(added).toBe(2);

    const raw = await getDb().select().from(stockItems);
    expect(raw.some((r) => r.payloadEncrypted.includes('one.example'))).toBe(false);
    // 2 pre-existing fixture items + 2 new
    expect((await countAvailable(getDb(), [c.gemini12m.id])).get(c.gemini12m.id)).toBe(4);

    const listed = await listStock(getDb(), testCipher, c.gemini12m.id);
    expect(listed[0]?.preview).toBe('https://…5678');
    expect((await listRecentAudit(getDb(), 1))[0]).toMatchObject({
      action: 'stock.add',
      data: { count: 2 },
    });
  });

  it('refuses stock for email-activation products and empty input', async () => {
    const c = await seedTestCatalog(getDb());
    await expect(
      addStock(getDb(), testCipher, { variantId: c.chatgpt1m.id, text: 'x', actor: 1 }),
    ).rejects.toThrow(StockError);
    await expect(
      addStock(getDb(), testCipher, { variantId: c.gemini12m.id, text: ' \n ', actor: 1 }),
    ).rejects.toThrow(StockError);
  });

  it('removes only unsold items', async () => {
    const c = await seedTestCatalog(getDb());
    await addStock(getDb(), testCipher, {
      variantId: c.gemini12m.id,
      text: 'https://x/1',
      actor: 1,
    });
    const [item] = await listStock(getDb(), testCipher, c.gemini12m.id);
    if (!item) throw new Error('missing');
    expect(await removeStockItem(getDb(), { id: item.id, actor: 1 })).toBe(true);
    const sold = (await getDb().select().from(stockItems)).find((r) => r.status === 'sold');
    if (!sold) throw new Error('fixture has a sold item');
    expect(await removeStockItem(getDb(), { id: sold.id, actor: 1 })).toBe(false);
  });

  it('masks short and long payloads', () => {
    expect(mask('abc')).toBe('abc…');
    expect(mask('user@example.com\nsecret')).toBe('user@exa….com');
  });
});
