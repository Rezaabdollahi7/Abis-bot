import { toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { registerCustomer } from '../modules/customers/index.js';
import { deliverOrder, purchase, rejectOrder } from '../modules/orders/index.js';
import { addBankCard, setActiveBankCard, updateSetting } from '../modules/settings/index.js';
import { createAdjustment, getBalance } from '../modules/wallet/index.js';
import { TEST_CUSTOMER_ID, createTestBot } from '../test/bot.js';
import { testCipher } from '../test/cipher.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';
import { shopCb } from './keyboards.js';
import { myOrdersCb } from './my-orders.js';

const getDb = useTestDb();
const OWNER = 1;
const bot = () => createTestBot(getDb(), { ownerIds: [OWNER] });

function buttons(t: ReturnType<typeof bot>, method?: string): string[] {
  const last = t.calls
    .filter((c) => c.payload.reply_markup && (!method || c.method === method))
    .at(-1);
  const markup = last?.payload.reply_markup as { inline_keyboard?: { callback_data?: string }[][] };
  return (markup.inline_keyboard ?? [])
    .flat()
    .flatMap((b) => (b.callback_data ? [b.callback_data] : []));
}

describe('continuing a purchase after a top-up', () => {
  it('pre-invoice → top up the shortfall → approve → «ادامه‌ی خرید» → pay', async () => {
    const c = await seedTestCatalog(getDb());
    const card = await addBankCard(getDb(), OWNER, {
      number: '6037990000000006',
      holderName: 'O',
      bankName: 'ملی',
    });
    await setActiveBankCard(getDb(), OWNER, card.id);
    await updateSetting(getDb(), 'requirePhone', false);
    const t = bot();

    await t.pressButton(shopCb.buy(c.chatgpt1m.id));
    await t.sendText('me@mail.com');
    const topupButton = buttons(t).find((b) => b.startsWith('tq:'));
    expect(topupButton).toBe('tq:800000');
    await t.pressButton(topupButton ?? '');
    await t.sendPhoto('receipt');
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('خریدتان را ادامه می‌دهید');

    await t.pressButton('tp:a:1', OWNER);
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('خرید نیمه‌کاره');
    expect(buttons(t, 'sendMessage')).toContain('resume');

    await t.pressButton('resume');
    const text = String(t.calls.filter((x) => x.method === 'editMessageText').at(-1)?.payload.text);
    expect(text).toContain('me@mail.com');
    const pay = buttons(t).find((b) => b.startsWith('pay:'));
    await t.pressButton(pay ?? '');
    expect(String(t.callsOf('editMessageText').at(-1)?.payload.text)).toContain('در صف تحویل');

    // The cart is cleared after buying: the resume button no longer works.
    await t.pressButton('resume');
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('منقضی');
  });
});

describe('«خریدهای من»', () => {
  it('lists orders and shows delivered links, admin notes and rejections again', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await registerCustomer(getDb(), {
      telegramId: TEST_CUSTOMER_ID,
      firstName: 'C',
    });
    await createAdjustment(getDb(), {
      customerId: customer.id,
      amount: toman(10_000_000),
      reason: 'x',
      actor: OWNER,
    });
    const buy = (variantId: number, key: string) =>
      purchase(getDb(), testCipher, {
        customerId: customer.id,
        variantId,
        quantity: 1,
        customerInput: { email: 'me@mail.com' },
        requestKey: key,
      });
    const link = await buy(c.gemini12m.id, 'a');
    const manual = await buy(c.chatgpt1m.id, 'b');
    const rejected = await buy(c.chatgpt3m.id, 'c');
    if (!link.ok || !manual.ok || !rejected.ok) throw new Error('setup');
    await deliverOrder(getDb(), testCipher, {
      orderId: manual.order.id,
      actor: OWNER,
      note: 'روی ایمیل شما فعال شد',
    });
    await rejectOrder(getDb(), { orderId: rejected.order.id, actor: OWNER, reason: 'ناموجود' });

    const t = bot();
    await t.pressButton(myOrdersCb.list);
    expect(buttons(t)).toEqual(
      expect.arrayContaining([
        `mo:${link.order.id}`,
        `mo:${manual.order.id}`,
        `mo:${rejected.order.id}`,
      ]),
    );

    const detail = async (id: number) => {
      await t.pressButton(`mo:${id}`);
      return String(t.callsOf('editMessageText').at(-1)?.payload.text);
    };
    expect(await detail(link.order.id)).toContain('<pre>https://gemini.example/a</pre>');
    expect(await detail(manual.order.id)).toContain('روی ایمیل شما فعال شد');
    expect(await detail(rejected.order.id)).toContain('برگشت خورده');
    expect(buttons(t)).toContain(`tk:o:${rejected.order.id}`);

    // Someone else cannot open these orders.
    const before = t.callsOf('editMessageText').length;
    await t.pressButton(`mo:${link.order.id}`, 9999);
    expect(t.callsOf('editMessageText')).toHaveLength(before);
    expect(await getBalance(getDb(), customer.id)).toBe(10_000_000 - 1_500_000 - 800_000);
  });
});
