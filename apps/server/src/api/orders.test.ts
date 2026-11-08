import { type OrderDto, type WarrantyDto, toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { registerCustomer } from '../modules/customers/index.js';
import { recordNotifications } from '../modules/notifications/index.js';
import { purchase } from '../modules/orders/index.js';
import { createAdjustment, getBalance } from '../modules/wallet/index.js';
import { TEST_OWNER_ID, adminClient } from '../test/api.js';
import { testCipher } from '../test/cipher.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';

const getDb = useTestDb();

async function queued() {
  const c = await seedTestCatalog(getDb());
  const customer = await registerCustomer(getDb(), { telegramId: 777, firstName: 'Sara' });
  await createAdjustment(getDb(), {
    customerId: customer.id,
    amount: toman(1_000_000),
    reason: 'funds',
    actor: TEST_OWNER_ID,
  });
  const result = await purchase(getDb(), testCipher, {
    customerId: customer.id,
    variantId: c.chatgpt1m.id,
    quantity: 1,
    customerInput: { email: 'sara@mail.com' },
    requestKey: 'k1',
  });
  if (!result.ok) throw new Error(result.reason);
  await recordNotifications(getDb(), { type: 'order', id: result.order.id }, [
    { chatId: TEST_OWNER_ID, messageId: 55 },
  ]);
  return { customer, order: result.order };
}

describe('orders API', () => {
  it('lists the manual queue with the decrypted customer input', async () => {
    await queued();
    const list = (await (await adminClient(getDb()).get('/orders')).json()) as OrderDto[];
    expect(list[0]).toMatchObject({
      status: 'queued',
      productLine: '🟢 ChatGPT Plus · ۱ ماهه',
      input: { email: 'sara@mail.com' },
      customer: { firstName: 'Sara' },
    });
  });

  it('delivers: the customer gets the note and the admin alert is updated', async () => {
    const { order } = await queued();
    const api = adminClient(getDb());
    const res = await api.send('POST', `/orders/${order.id}/deliver`, {
      note: 'روی ایمیل شما فعال شد',
    });
    expect(((await res.json()) as OrderDto).status).toBe('delivered');
    const toCustomer = api.telegramCalls.find((c) => c.method === 'sendMessage');
    expect(toCustomer?.payload.chat_id).toBe(777);
    expect(String(toCustomer?.payload.text)).toContain('روی ایمیل شما فعال شد');
    const edit = api.telegramCalls.find((c) => c.method === 'editMessageText');
    expect(edit?.payload).toMatchObject({ chat_id: TEST_OWNER_ID, message_id: 55 });
    expect(String(edit?.payload.text)).toContain('تحویل شد');
  });

  it('rejects with refund, then a second decision is a 409', async () => {
    const { customer, order } = await queued();
    const api = adminClient(getDb());
    await api.send('POST', `/orders/${order.id}/reject`, { reason: 'سرویس موقتاً در دسترس نیست' });
    expect(await getBalance(getDb(), customer.id)).toBe(1_000_000);
    const again = await api.send('POST', `/orders/${order.id}/deliver`, { note: 'x' });
    expect(again.status).toBe(409);
  });
});

describe('warranty API', () => {
  it('shows warranty info and pays a refund once, notifying the customer', async () => {
    const { customer, order } = await queued();
    const api = adminClient(getDb());
    await api.send('POST', `/orders/${order.id}/deliver`, { note: 'done' });

    const info = (await (await api.get(`/orders/${order.id}/warranty`)).json()) as WarrantyDto;
    expect(info).toMatchObject({ underWarranty: true, alreadyRefunded: false });
    expect(info.suggestedRefundToman).toBeGreaterThan(700_000);

    const res = await api.send('POST', `/orders/${order.id}/warranty-refund`, {
      amountToman: info.suggestedRefundToman,
      reason: 'اکانت مسدود شد',
    });
    expect(res.status).toBe(200);
    expect(await getBalance(getDb(), customer.id)).toBe(200_000 + info.suggestedRefundToman);
    expect(String(api.telegramCalls.at(-1)?.payload.text)).toContain('گارانتی سفارش');

    const again = await api.send('POST', `/orders/${order.id}/warranty-refund`, {
      amountToman: 1000,
      reason: 'again',
    });
    expect(again.status).toBe(400);
  });
});
