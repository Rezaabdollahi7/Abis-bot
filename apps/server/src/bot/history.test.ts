import { toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { registerCustomer } from '../modules/customers/index.js';
import { purchase } from '../modules/orders/index.js';
import { addBankCard } from '../modules/settings/index.js';
import { closeTicket, listMessages, openTicket } from '../modules/tickets/index.js';
import { approveTopup, createAdjustment, createTopup } from '../modules/wallet/index.js';
import { TEST_CUSTOMER_ID, createTestBot } from '../test/bot.js';
import { testCipher } from '../test/cipher.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';

const getDb = useTestDb();
const OWNER = 1;
const bot = () => createTestBot(getDb(), { ownerIds: [OWNER] });

function buttons(t: ReturnType<typeof bot>): string[] {
  const last = t.calls.filter((c) => c.payload.reply_markup).at(-1);
  const markup = last?.payload.reply_markup as { inline_keyboard?: { callback_data?: string }[][] };
  return (markup.inline_keyboard ?? [])
    .flat()
    .flatMap((b) => (b.callback_data ? [b.callback_data] : []));
}
const lastEdit = (t: ReturnType<typeof bot>) =>
  String(t.callsOf('editMessageText').at(-1)?.payload.text);

describe('closed tickets', () => {
  it('stay visible to the customer with the whole conversation', async () => {
    const customer = await registerCustomer(getDb(), {
      telegramId: TEST_CUSTOMER_ID,
      firstName: 'C',
    });
    const ticket = await openTicket(getDb(), {
      customerId: customer.id,
      topic: 'payment',
      message: { text: 'سؤال قدیمی' },
    });
    await closeTicket(getDb(), { ticketId: ticket.id, actor: OWNER });
    const t = bot();
    await t.pressButton('tk:closed');
    expect(buttons(t)).toContain(`tk:v:${ticket.id}`);
    await t.pressButton(`tk:v:${ticket.id}`);
    expect(lastEdit(t)).toContain('سؤال قدیمی');
  });
});

describe('/admin → 📜 history', () => {
  async function data() {
    const c = await seedTestCatalog(getDb());
    const customer = await registerCustomer(getDb(), {
      telegramId: TEST_CUSTOMER_ID,
      firstName: 'Sara',
    });
    await registerCustomer(getDb(), { telegramId: OWNER, firstName: 'Reza' });
    await createAdjustment(getDb(), {
      customerId: customer.id,
      amount: toman(5_000_000),
      reason: 'x',
      actor: OWNER,
    });
    const delivered = await purchase(getDb(), testCipher, {
      customerId: customer.id,
      variantId: c.gemini12m.id,
      quantity: 1,
      requestKey: 'a',
    });
    const card = await addBankCard(getDb(), OWNER, {
      number: '6037990000000006',
      holderName: 'O',
      bankName: 'ملی',
    });
    const topup = await createTopup(getDb(), {
      customerId: customer.id,
      amount: toman(300_000),
      bankCardId: card.id,
      receiptFileId: 'f',
      receiptFileUniqueId: 'u',
    });
    await approveTopup(getDb(), { topupId: topup.id, actor: OWNER });
    const ticket = await openTicket(getDb(), {
      customerId: customer.id,
      topic: 'general',
      message: { text: 'سلام' },
    });
    await closeTicket(getDb(), { ticketId: ticket.id, actor: OWNER });
    if (!delivered.ok) throw new Error('setup');
    return { order: delivered.order, ticket };
  }

  it('lists delivered orders too and opens their detail', async () => {
    const { order } = await data();
    const t = bot();
    await t.pressButton('ah:orders', OWNER);
    expect(buttons(t)).toContain(`ah:o:${order.id}`);
    await t.pressButton(`ah:o:${order.id}`, OWNER);
    expect(lastEdit(t)).toContain('تحویل شده');
    expect(lastEdit(t)).toContain('۱ آیتم از انبار تحویل شد');
  });

  it('shows approved top-ups and stats', async () => {
    await data();
    const t = bot();
    await t.pressButton('ah:topups', OWNER);
    expect(lastEdit(t)).toContain('۳۰۰٬۰۰۰ تومان');
    await t.pressButton('ah:stats', OWNER);
    expect(lastEdit(t)).toContain('۷ روز اخیر');
    expect(lastEdit(t)).toContain('۱٬۵۰۰٬۰۰۰ تومان');
  });

  it('opens a closed ticket thread that still accepts a Reply', async () => {
    const { ticket } = await data();
    const t = bot();
    await t.pressButton('ah:tickets', OWNER);
    expect(buttons(t)).toContain(`ah:t:${ticket.id}`);
    await t.pressButton(`ah:t:${ticket.id}`, OWNER);
    const thread = t.callsOf('sendMessage').at(-1);
    expect(String(thread?.payload.text)).toContain('سلام');
    const threadMessageId = 100 + t.calls.filter((c) => c.method.startsWith('send')).length;
    await t.replyTo(threadMessageId, 'پاسخ از تاریخچه', OWNER);
    expect((await listMessages(getDb(), ticket.id)).at(-1)?.text).toBe('پاسخ از تاریخچه');
  });

  it('is refused to non-admins', async () => {
    const t = bot();
    await t.pressButton('ah:orders', TEST_CUSTOMER_ID);
    expect(t.callsOf('answerCallbackQuery').at(-1)?.payload).toMatchObject({ show_alert: true });
  });
});
