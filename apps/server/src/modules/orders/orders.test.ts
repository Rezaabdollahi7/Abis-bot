import { toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { testCipher } from '../../test/cipher.js';
import { useTestDb } from '../../test/db.js';
import { seedTestCatalog } from '../../test/fixtures.js';
import { getVariantView } from '../catalog/index.js';
import { registerCustomer } from '../customers/index.js';
import { createAdjustment, getBalance, listLedger } from '../wallet/index.js';
import {
  deliverOrder,
  getOrder,
  listActiveSubscriptions,
  listOrders,
  purchase,
  readCustomerInput,
  readDeliveryNote,
  rejectOrder,
  validateInput,
} from './index.js';

const getDb = useTestDb();

async function richCustomer(amount = 10_000_000) {
  const customer = await registerCustomer(getDb(), { telegramId: 42, firstName: 'C' });
  await createAdjustment(getDb(), {
    customerId: customer.id,
    amount: toman(amount),
    reason: 'test funds',
    actor: 1,
  });
  return customer;
}

let key = 0;
const buy = (customerId: number, variantId: number, quantity = 1, customerInput = {}) =>
  purchase(getDb(), testCipher, {
    customerId,
    variantId,
    quantity,
    customerInput,
    requestKey: `k${++key}`,
  });

describe('validateInput', () => {
  it('requires every field and a valid email', () => {
    expect(validateInput(['email'], { email: 'a@b.co' })).toBeUndefined();
    expect(validateInput(['email'], { email: 'nope' })).toBe('email');
    expect(validateInput(['email', 'password'], { email: 'a@b.co', password: ' ' })).toBe(
      'password',
    );
  });
});

describe('purchase', () => {
  it('delivers stock instantly, charges the wallet and starts a subscription', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await richCustomer();
    const result = await buy(customer.id, c.gemini12m.id, 2);
    if (!result.ok) throw new Error(result.reason);

    expect(result.order.status).toBe('delivered');
    expect(result.items.sort()).toEqual(['https://gemini.example/a', 'https://gemini.example/b']);
    expect(result.order.totalToman).toBe(3_000_000);
    expect(await getBalance(getDb(), customer.id)).toBe(7_000_000);
    expect(result.stockLeft).toBe(0);
    expect((await getVariantView(getDb(), c.gemini12m.id))?.variant.soldCount).toBe(2);
    const [entry] = await listLedger(getDb(), customer.id, 1);
    expect(entry).toMatchObject({
      kind: 'purchase',
      amountToman: -3_000_000,
      refId: result.order.id,
    });
  });

  it('queues an email activation with the customer’s fields encrypted', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await richCustomer();
    const result = await buy(customer.id, c.chatgpt1m.id, 1, { email: 'me@mail.com' });
    if (!result.ok) throw new Error(result.reason);
    expect(result.order.status).toBe('queued');
    expect(result.items).toEqual([]);
    const order = await getOrder(getDb(), result.order.id);
    if (!order) throw new Error('missing');
    expect(order.customerInputEncrypted).not.toContain('me@mail.com');
    expect(readCustomerInput(testCipher, order)).toEqual({ email: 'me@mail.com' });
  });

  it('queues a stock-based order when stock is empty', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await richCustomer();
    await buy(customer.id, c.gemini12m.id, 2);
    const result = await buy(customer.id, c.gemini12m.id, 1);
    expect(result).toMatchObject({ ok: true, order: { status: 'queued' }, items: [] });
  });

  it('refuses a partial fill and rolls everything back', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await richCustomer();
    const result = await buy(customer.id, c.gemini12m.id, 3);
    expect(result).toEqual({ ok: false, reason: 'not_enough_stock', available: 2 });
    expect(await getBalance(getDb(), customer.id)).toBe(10_000_000);
    expect((await getVariantView(getDb(), c.gemini12m.id))?.stock).toBe(2);
  });

  it('reports the shortfall when the wallet is too low', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await richCustomer(500_000);
    expect(await buy(customer.id, c.chatgpt1m.id, 1, { email: 'me@mail.com' })).toEqual({
      ok: false,
      reason: 'insufficient_balance',
      shortfall: 300_000,
      balance: 500_000,
    });
  });

  it('rejects bad quantity, bad input and inactive variants', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await richCustomer();
    expect(await buy(customer.id, c.chatgpt1m.id, 2, { email: 'me@mail.com' })).toMatchObject({
      reason: 'invalid_quantity',
    });
    expect(await buy(customer.id, c.gemini12m.id, 11)).toMatchObject({
      reason: 'invalid_quantity',
    });
    expect(await buy(customer.id, c.chatgpt1m.id, 1, { email: 'x' })).toMatchObject({
      reason: 'invalid_input',
      field: 'email',
    });
    expect(await buy(customer.id, 9999)).toMatchObject({ reason: 'not_on_sale' });
  });

  it('a double click with the same request key buys once', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await richCustomer();
    const request = {
      customerId: customer.id,
      variantId: c.gemini12m.id,
      quantity: 1,
      requestKey: 'same-button',
    };
    const results = await Promise.all([
      purchase(getDb(), testCipher, request),
      purchase(getDb(), testCipher, request),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: 'duplicate' });
    expect(await getBalance(getDb(), customer.id)).toBe(8_500_000);
  });

  it('two customers racing for the last item: one gets it, the other is queued', async () => {
    const c = await seedTestCatalog(getDb());
    const a = await richCustomer();
    const b = await registerCustomer(getDb(), { telegramId: 43, firstName: 'B' });
    await createAdjustment(getDb(), {
      customerId: b.id,
      amount: toman(5_000_000),
      reason: 'x',
      actor: 1,
    });
    await buy(a.id, c.gemini12m.id, 1);
    const [ra, rb] = await Promise.all([
      buy(a.id, c.gemini12m.id, 1),
      buy(b.id, c.gemini12m.id, 1),
    ]);
    const statuses = [ra, rb].map((r) => (r.ok ? r.order.status : r.reason)).sort();
    expect(statuses).toEqual(['delivered', 'queued']);
  });
});

describe('manual delivery', () => {
  async function queuedOrder() {
    const c = await seedTestCatalog(getDb());
    const customer = await richCustomer(1_000_000);
    const result = await buy(customer.id, c.chatgpt1m.id, 1, { email: 'me@mail.com' });
    if (!result.ok) throw new Error(result.reason);
    return { customer, order: result.order };
  }

  it('delivers once, stores the note encrypted, starts the subscription and schedules the purge', async () => {
    const { customer, order } = await queuedOrder();
    const first = await deliverOrder(getDb(), testCipher, {
      orderId: order.id,
      actor: 1,
      note: 'فعال شد',
    });
    const second = await deliverOrder(getDb(), testCipher, {
      orderId: order.id,
      actor: 2,
      note: 'x',
    });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({
      ok: false,
      order: { status: 'delivered', handledByTelegramId: 1 },
    });
    if (!first.ok) return;
    expect(first.order.deliveryNoteEncrypted).not.toContain('فعال');
    expect(readDeliveryNote(testCipher, first.order)).toBe('فعال شد');
    const purgeDays =
      ((first.order.inputPurgeAt?.getTime() ?? 0) - (first.order.deliveredAt?.getTime() ?? 0)) /
      86_400_000;
    expect(purgeDays).toBe(7);
    const [active] = await listActiveSubscriptions(getDb(), customer.id);
    expect(active?.order.id).toBe(order.id);
  });

  it('rejects once with a full refund and no subscription', async () => {
    const { customer, order } = await queuedOrder();
    expect(await getBalance(getDb(), customer.id)).toBe(200_000);
    const results = await Promise.all([
      rejectOrder(getDb(), { orderId: order.id, actor: 1, reason: 'out of service' }),
      rejectOrder(getDb(), { orderId: order.id, actor: 2, reason: 'out of service' }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await getBalance(getDb(), customer.id)).toBe(1_000_000);
    expect(await listActiveSubscriptions(getDb(), customer.id)).toEqual([]);
    const delivered = await deliverOrder(getDb(), testCipher, {
      orderId: order.id,
      actor: 1,
      note: 'x',
    });
    expect(delivered.ok).toBe(false);
  });

  it('lists the queue oldest first', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await richCustomer();
    const a = await buy(customer.id, c.chatgpt1m.id, 1, { email: 'a@mail.com' });
    const b = await buy(customer.id, c.chatgpt3m.id, 1, { email: 'b@mail.com' });
    if (!a.ok || !b.ok) throw new Error('setup failed');
    expect((await listOrders(getDb(), 'queued', 10)).map((o) => o.id)).toEqual([
      a.order.id,
      b.order.id,
    ]);
  });
});
