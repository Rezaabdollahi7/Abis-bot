import { toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { createProduct, createVariant } from '../modules/catalog/index.js';
import { registerCustomer } from '../modules/customers/index.js';
import { getOrder, purchase } from '../modules/orders/index.js';
import { getTicket, listMessages, openTicket } from '../modules/tickets/index.js';
import { createAdjustment, getBalance } from '../modules/wallet/index.js';
import { createTestBot } from '../test/bot.js';
import { testCipher } from '../test/cipher.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';
import { alertAdminsOfQueuedOrder } from './order-alerts.js';
import { alertAdminsOfTicket } from './support.js';

const getDb = useTestDb();
const OWNER = 1;
const CUSTOMER = 777;

async function queuedOrder(withPassword = false) {
  const c = await seedTestCatalog(getDb());
  const customer = await registerCustomer(getDb(), { telegramId: CUSTOMER, firstName: 'Sara' });
  await createAdjustment(getDb(), {
    customerId: customer.id,
    amount: toman(5_000_000),
    reason: 'x',
    actor: OWNER,
  });
  let variantId = c.chatgpt1m.id;
  if (withPassword) {
    const product = await createProduct(getDb(), {
      providerId: c.openai.id,
      name: 'Pro',
      deliveryMethod: 'email_activation',
      requiredFields: ['email', 'password'],
    });
    variantId = (
      await createVariant(getDb(), {
        productId: product.id,
        durationDays: 30,
        priceToman: toman(100_000),
      })
    ).id;
  }
  const result = await purchase(getDb(), testCipher, {
    customerId: customer.id,
    variantId,
    quantity: 1,
    customerInput: { email: 'sara@mail.com', password: 'S3cret' },
    requestKey: 'k',
  });
  if (!result.ok) throw new Error(result.reason);
  return { customer, result };
}

describe('delivering a queued order from the chat', () => {
  it('asks for the delivery message and sends it to the customer', async () => {
    const { result } = await queuedOrder();
    const t = createTestBot(getDb(), { ownerIds: [OWNER] });
    await alertAdminsOfQueuedOrder(t.api, getDb(), [OWNER], testCipher, result.order);
    expect(JSON.stringify(t.callsOf('sendMessage').at(-1)?.payload.reply_markup)).toContain(
      `od:d:${result.order.id}`,
    );

    await t.pressButton(`od:d:${result.order.id}`, OWNER);
    expect(t.sentTo(OWNER).at(-1)).toContain('پیام تحویل سفارش');
    await t.sendText('اشتراک روی ایمیل شما فعال شد ✅', OWNER);

    expect((await getOrder(getDb(), result.order.id))?.status).toBe('delivered');
    expect(t.sentTo(CUSTOMER).at(-1)).toContain('اشتراک روی ایمیل شما فعال شد');
    expect(t.sentTo(OWNER).at(-1)).toContain('تحویل شد و به مشتری ارسال شد');
  });

  it('rejects with a preset reason and refunds', async () => {
    const { customer, result } = await queuedOrder();
    const t = createTestBot(getDb(), { ownerIds: [OWNER] });
    await t.pressButton(`od:r:${result.order.id}`, OWNER);
    await t.pressButton(`od:x:${result.order.id}:0`, OWNER);
    expect(await getBalance(getDb(), customer.id)).toBe(5_000_000);
    expect(t.sentTo(CUSTOMER).at(-1)).toContain('موجودی این سرویس فعلاً تمام شده است');
  });

  it('shows the customer password only as a popup to admins', async () => {
    const { result } = await queuedOrder(true);
    const t = createTestBot(getDb(), { ownerIds: [OWNER] });
    await t.pressButton(`od:p:${result.order.id}`, OWNER);
    expect(t.callsOf('answerCallbackQuery').at(-1)?.payload).toMatchObject({ show_alert: true });
    expect(String(t.callsOf('answerCallbackQuery').at(-1)?.payload.text)).toContain('S3cret');
    expect(t.callsOf('sendMessage').some((c) => String(c.payload.text).includes('S3cret'))).toBe(
      false,
    );

    await t.pressButton(`od:p:${result.order.id}`, CUSTOMER);
    expect(String(t.callsOf('answerCallbackQuery').at(-1)?.payload.text)).not.toContain('S3cret');
  });
});

describe('answering a ticket by replying to its alert', () => {
  it('sends the reply to the customer and records it in the ticket', async () => {
    const customer = await registerCustomer(getDb(), { telegramId: CUSTOMER, firstName: 'Sara' });
    await registerCustomer(getDb(), { telegramId: OWNER, firstName: 'Reza' });
    const ticket = await openTicket(getDb(), {
      customerId: customer.id,
      topic: 'general',
      message: { text: 'سؤال' },
    });
    const t = createTestBot(getDb(), { ownerIds: [OWNER] });
    await alertAdminsOfTicket(t.api, getDb(), [OWNER], ticket, { text: 'سؤال' }, true);
    const alertId = t.callsOf('sendMessage').length + 100;

    await t.replyTo(alertId, 'سلام، بفرمایید', OWNER);

    expect(t.sentTo(CUSTOMER).at(-1)).toContain('سلام، بفرمایید');
    const messages = await listMessages(getDb(), ticket.id);
    expect(messages.at(-1)).toMatchObject({ fromAdminTelegramId: OWNER, text: 'سلام، بفرمایید' });
    expect((await getTicket(getDb(), ticket.id))?.status).toBe('awaiting_customer');
  });
});
