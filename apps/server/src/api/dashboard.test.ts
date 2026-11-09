import { type AdminDto, type DashboardDto, toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { registerCustomer } from '../modules/customers/index.js';
import { purchase } from '../modules/orders/index.js';
import { addBankCard, updateSetting } from '../modules/settings/index.js';
import { approveTopup, createTopup } from '../modules/wallet/index.js';
import { TEST_OWNER_ID, adminClient } from '../test/api.js';
import { testCipher } from '../test/cipher.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';
import { startOfTehranDay } from './dashboard.js';

const getDb = useTestDb();

describe('startOfTehranDay', () => {
  it('uses Tehran midnight (UTC+3:30)', () => {
    // 22:00 UTC on Nov 8 is already 01:30 on Nov 9 in Tehran.
    expect(startOfTehranDay(new Date('2026-11-08T22:00:00Z')).toISOString()).toBe(
      '2026-11-08T20:30:00.000Z',
    );
    expect(startOfTehranDay(new Date('2026-11-08T10:00:00Z')).toISOString()).toBe(
      '2026-11-07T20:30:00.000Z',
    );
  });
});

describe('dashboard API', () => {
  it('reports sales, top-ups, new customers, pending work and low stock', async () => {
    const c = await seedTestCatalog(getDb());
    await updateSetting(getDb(), 'lowStockThreshold', 1);
    const customer = await registerCustomer(getDb(), { telegramId: 777, firstName: 'Sara' });
    const card = await addBankCard(getDb(), TEST_OWNER_ID, {
      number: '6037990000000006',
      holderName: 'O',
      bankName: 'ملی',
    });
    const topup = await createTopup(getDb(), {
      customerId: customer.id,
      amount: toman(2_000_000),
      bankCardId: card.id,
      receiptFileId: 'f',
      receiptFileUniqueId: 'u',
    });
    await approveTopup(getDb(), { topupId: topup.id, actor: TEST_OWNER_ID });
    await createTopup(getDb(), {
      customerId: customer.id,
      amount: toman(100_000),
      bankCardId: card.id,
      receiptFileId: 'f2',
      receiptFileUniqueId: 'u2',
    });
    await purchase(getDb(), testCipher, {
      customerId: customer.id,
      variantId: c.gemini12m.id,
      quantity: 1,
      requestKey: 'k',
    });

    const d = (await (await adminClient(getDb()).get('/dashboard')).json()) as DashboardDto;
    expect(d.today.sales).toEqual({ count: 1, total: 1_500_000 });
    expect(d.today.topups).toEqual({ count: 1, total: 2_000_000 });
    expect(d.month.newCustomers).toBe(1);
    expect(d.pending).toEqual({ topups: 1, orders: 0, tickets: 0 });
    expect(d.lowStock).toEqual([
      { variantId: c.gemini12m.id, line: '🔵 Gemini Pro · یک ساله', stock: 1 },
    ]);
  });
});

describe('admins API', () => {
  it('adds and removes admins but never owners', async () => {
    const api = adminClient(getDb());
    await api.send('POST', '/admins', { telegramId: 5050 });
    const list = (await (await api.get('/admins')).json()) as AdminDto[];
    expect(list.map((a) => [a.telegramId, a.isOwner])).toEqual([
      [TEST_OWNER_ID, true],
      [5050, false],
    ]);
    expect((await api.delete(`/admins/${TEST_OWNER_ID}`)).status).toBe(403);
    expect((await api.delete('/admins/5050')).status).toBe(204);
    expect(await (await adminClient(getDb(), 5050).get('/me')).status).toBe(403);
  });
});
