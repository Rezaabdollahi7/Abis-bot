import { toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { registerCustomer } from '../modules/customers/index.js';
import { purchase } from '../modules/orders/index.js';
import { addAdminReply, getTicket, listMessages } from '../modules/tickets/index.js';
import { createAdjustment } from '../modules/wallet/index.js';
import { TEST_CUSTOMER_ID, createTestBot } from '../test/bot.js';
import { testCipher } from '../test/cipher.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';
import { cb } from './keyboards.js';
import { supportCb } from './support.js';

const getDb = useTestDb();
const OWNER = 1;
const bot = () => createTestBot(getDb(), { ownerIds: [OWNER] });

function lastButtons(t: ReturnType<typeof bot>): string[] {
  const last = t.calls.filter((c) => c.payload.reply_markup).at(-1);
  const markup = last?.payload.reply_markup as { inline_keyboard?: { callback_data?: string }[][] };
  return (markup.inline_keyboard ?? [])
    .flat()
    .flatMap((b) => (b.callback_data ? [b.callback_data] : []));
}

describe('support tickets in the bot', () => {
  it('opens a general ticket with text and alerts admins', async () => {
    const t = bot();
    await t.pressButton(cb.support);
    await t.pressButton(supportCb.newTicket);
    await t.pressButton(supportCb.topic('general'));
    await t.sendText('ساعت کاری پشتیبانی چیه؟');

    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('تیکت #۱ ثبت شد');
    expect(t.sentTo(OWNER).at(-1)).toContain('ساعت کاری پشتیبانی چیه؟');
    const ticket = await getTicket(getDb(), 1);
    expect(ticket).toMatchObject({ topic: 'general', status: 'awaiting_admin', orderId: null });
  });

  it('links an order ticket to one of the customer’s orders and accepts a photo', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await registerCustomer(getDb(), {
      telegramId: TEST_CUSTOMER_ID,
      firstName: 'C',
    });
    await createAdjustment(getDb(), {
      customerId: customer.id,
      amount: toman(5_000_000),
      reason: 'x',
      actor: OWNER,
    });
    const order = await purchase(getDb(), testCipher, {
      customerId: customer.id,
      variantId: c.gemini12m.id,
      quantity: 1,
      requestKey: 'k',
    });
    if (!order.ok) throw new Error(order.reason);

    const t = bot();
    await t.pressButton(supportCb.newTicket);
    await t.pressButton(supportCb.topic('order'));
    expect(lastButtons(t)).toContain(supportCb.order(order.order.id));
    await t.pressButton(supportCb.order(order.order.id));
    await t.sendPhoto('error-shot');

    const ticket = await getTicket(getDb(), 1);
    expect(ticket?.orderId).toBe(order.order.id);
    const [message] = await listMessages(getDb(), 1);
    expect(message).toMatchObject({ fileId: 'big-error-shot', fileKind: 'photo' });
    const toAdmin = t.sentTo(OWNER).join('\n');
    expect(toAdmin).toContain('فایل پیوست');
    expect(t.callsOf('sendPhoto').at(-1)?.payload).toMatchObject({
      chat_id: OWNER,
      photo: 'big-error-shot',
    });
  });

  it('lets the customer view, reply to and close their ticket', async () => {
    const t = bot();
    await t.pressButton(supportCb.newTicket);
    await t.pressButton(supportCb.topic('payment'));
    await t.sendText('واریز کردم ولی شارژ نشد');
    await addAdminReply(getDb(), { ticketId: 1, actor: OWNER, text: 'لطفاً رسید را بفرستید' });

    await t.pressButton(cb.support);
    expect(lastButtons(t)).toContain(supportCb.view(1));
    await t.pressButton(supportCb.view(1));
    const view = String(t.callsOf('editMessageText').at(-1)?.payload.text);
    expect(view).toContain('لطفاً رسید را بفرستید');

    await t.pressButton(supportCb.reply(1));
    await t.sendText('این هم رسید');
    expect((await getTicket(getDb(), 1))?.status).toBe('awaiting_admin');

    await t.pressButton(supportCb.close(1));
    expect((await getTicket(getDb(), 1))?.status).toBe('closed');
  });

  it('ignores another customer’s ticket buttons', async () => {
    const t = bot();
    await t.pressButton(supportCb.newTicket);
    await t.pressButton(supportCb.topic('general'));
    await t.sendText('mine');
    await t.pressButton(supportCb.close(1), 5555);
    expect((await getTicket(getDb(), 1))?.status).toBe('awaiting_admin');
  });
});
