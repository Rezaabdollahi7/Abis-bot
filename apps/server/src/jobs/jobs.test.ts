import { toman } from '@abis/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { registerCustomer } from '../modules/customers/index.js';
import { deliverOrder, getOrder, purchase, purgeExpiredInput } from '../modules/orders/index.js';
import { subscriptions } from '../modules/orders/schema.js';
import { createAdjustment } from '../modules/wallet/index.js';
import { fakeTelegram } from '../test/api.js';
import { testCipher } from '../test/cipher.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';
import { sendExpiryReminders } from './index.js';

const getDb = useTestDb();
const DAY = 86_400_000;

async function delivered(variant: 'gemini12m' | 'chatgpt1m') {
  const c = await seedTestCatalog(getDb());
  const customer = await registerCustomer(getDb(), { telegramId: 777, firstName: 'Sara' });
  await createAdjustment(getDb(), {
    customerId: customer.id,
    amount: toman(5_000_000),
    reason: 'x',
    actor: 1,
  });
  const result = await purchase(getDb(), testCipher, {
    customerId: customer.id,
    variantId: c[variant].id,
    quantity: 1,
    customerInput: { email: 'sara@mail.com' },
    requestKey: 'k',
  });
  if (!result.ok) throw new Error(result.reason);
  return { c, order: result.order };
}

describe('expiry reminders', () => {
  it('reminds once, only inside the 3-day window, with a renew button', async () => {
    const { order, c } = await delivered('gemini12m');
    const [sub] = await getDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orderId, order.id));
    if (!sub) throw new Error('no subscription');
    const telegram = fakeTelegram();

    const fourDaysBefore = new Date(sub.expiresAt.getTime() - 4 * DAY);
    expect(await sendExpiryReminders(telegram.api, getDb(), fourDaysBefore)).toBe(0);

    const twoDaysBefore = new Date(sub.expiresAt.getTime() - 2 * DAY);
    expect(await sendExpiryReminders(telegram.api, getDb(), twoDaysBefore)).toBe(1);
    expect(await sendExpiryReminders(telegram.api, getDb(), twoDaysBefore)).toBe(0);

    const message = telegram.calls.find((call) => call.method === 'sendMessage');
    expect(message?.payload.chat_id).toBe(777);
    expect(String(message?.payload.text)).toContain('یادآوری تمدید');
    expect(JSON.stringify(message?.payload.reply_markup)).toContain(`var:${c.gemini12m.id}`);
  });

  it('never reminds about an already expired subscription', async () => {
    const { order } = await delivered('gemini12m');
    const [sub] = await getDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orderId, order.id));
    if (!sub) throw new Error('no subscription');
    const after = new Date(sub.expiresAt.getTime() + DAY);
    expect(await sendExpiryReminders(fakeTelegram().api, getDb(), after)).toBe(0);
  });
});

describe('input purge', () => {
  it('erases customer input 7 days after delivery, not before', async () => {
    const { order } = await delivered('chatgpt1m');
    await deliverOrder(getDb(), testCipher, { orderId: order.id, actor: 1, note: 'done' });
    const now = Date.now();
    expect(await purgeExpiredInput(getDb(), new Date(now + 6 * DAY))).toBe(0);
    expect(await purgeExpiredInput(getDb(), new Date(now + 8 * DAY))).toBe(1);
    expect((await getOrder(getDb(), order.id))?.customerInputEncrypted).toBeNull();
  });

  it('keeps input of orders still waiting in the queue', async () => {
    await delivered('chatgpt1m');
    expect(await purgeExpiredInput(getDb(), new Date(Date.now() + 365 * DAY))).toBe(0);
  });
});
