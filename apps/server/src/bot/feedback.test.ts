import { toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import {
  findCustomerByTelegramId,
  registerCustomer,
  searchCustomers,
  setBanned,
  setPhone,
} from '../modules/customers/index.js';
import { updateSetting } from '../modules/settings/index.js';
import { addStock } from '../modules/stock/index.js';
import { openTicket } from '../modules/tickets/index.js';
import { createAdjustment, getBalance } from '../modules/wallet/index.js';
import { TEST_CUSTOMER_ID, createTestBot } from '../test/bot.js';
import { testCipher } from '../test/cipher.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';
import { cb, shopCb } from './keyboards.js';
import { formatDuration } from './texts.js';

const getDb = useTestDb();
const OWNER = 1;
const bot = () => createTestBot(getDb(), { ownerIds: [OWNER] });

async function fundedCustomer(amount = 50_000_000) {
  const customer = await registerCustomer(getDb(), {
    telegramId: TEST_CUSTOMER_ID,
    firstName: 'C',
  });
  await createAdjustment(getDb(), {
    customerId: customer.id,
    amount: toman(amount),
    reason: 'x',
    actor: OWNER,
  });
  return customer;
}

function lastButtons(t: ReturnType<typeof bot>): string[] {
  const last = t.calls.filter((c) => c.payload.reply_markup).at(-1);
  const markup = last?.payload.reply_markup as { inline_keyboard?: { callback_data?: string }[][] };
  return (markup.inline_keyboard ?? [])
    .flat()
    .flatMap((b) => (b.callback_data ? [b.callback_data] : []));
}

describe('durations in words', () => {
  it('reads naturally in Persian', () => {
    expect([30, 90, 180, 360, 7].map(formatDuration)).toEqual([
      'یک ماهه',
      'سه ماهه',
      'شش ماهه',
      'یک ساله',
      '۷ روزه',
    ]);
  });
});

describe('quantity', () => {
  it('offers 1–3 and a "more" button that accepts a typed number up to the stock', async () => {
    const c = await seedTestCatalog(getDb());
    await addStock(getDb(), testCipher, {
      variantId: c.gemini12m.id,
      text: Array.from({ length: 10 }, (_, i) => `https://x/${i}`).join('\n'),
      actor: OWNER,
    });
    const customer = await fundedCustomer();
    const t = bot();
    await t.pressButton(shopCb.buy(c.gemini12m.id));
    const buttons = lastButtons(t);
    expect(buttons.filter((b) => b.startsWith('qty:'))).toHaveLength(3);
    expect(buttons).toContain(`qmore:${c.gemini12m.id}`);

    await t.pressButton(`qmore:${c.gemini12m.id}`);
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('حداکثر ۱۲');
    await t.sendText('۲۰');
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('بین ۱ و ۱۲');
    await t.sendText('۵');
    const pay = lastButtons(t).find((b) => b.startsWith('pay:'));
    if (!pay) throw new Error('no pay button');
    await t.pressButton(pay);
    expect(await getBalance(getDb(), customer.id)).toBe(50_000_000 - 5 * 1_500_000);
  });
});

describe('admin awareness', () => {
  it('tells admins about every instant sale and keeps warning while stock is low', async () => {
    const c = await seedTestCatalog(getDb());
    await fundedCustomer();
    const t = bot();
    for (let i = 0; i < 2; i++) {
      await t.pressButton(shopCb.buy(c.gemini12m.id));
      await t.pressButton(`qty:${c.gemini12m.id}:1`);
      const pay = lastButtons(t).find((b) => b.startsWith('pay:'));
      if (pay) await t.pressButton(pay);
    }
    const toAdmin = t.sentTo(OWNER);
    expect(toAdmin.filter((m) => m.includes('فروش جدید'))).toHaveLength(2);
    expect(toAdmin.filter((m) => m.includes('موجودی رو به اتمام'))).toHaveLength(2);
  });

  it('tells the customer when support closes their ticket', async () => {
    const customer = await registerCustomer(getDb(), {
      telegramId: TEST_CUSTOMER_ID,
      firstName: 'C',
    });
    const ticket = await openTicket(getDb(), {
      customerId: customer.id,
      topic: 'general',
      message: { text: 'q' },
    });
    const t = bot();
    await t.pressButton(`tk:ac:${ticket.id}`, OWNER);
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('توسط پشتیبانی بسته شد');
  });
});

describe('customer search', () => {
  it('finds a phone from a fragment, a leading 0 or Persian digits', async () => {
    const c = await registerCustomer(getDb(), { telegramId: 5, firstName: 'Sara' });
    await setPhone(getDb(), c.id, '989121234567');
    for (const q of ['0912123', '۰۹۱۲۱۲۳۴۵۶۷', '4567', '+98912']) {
      expect((await searchCustomers(getDb(), q, 5)).map((x) => x.id)).toEqual([c.id]);
    }
  });
});

describe('unexpected messages', () => {
  it('get a friendly answer with the main menu instead of silence', async () => {
    const t = bot();
    await t.sendText('سلام، کسی هست؟');
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('متوجه پیام شما نشدم');
  });
});

describe('banned customers', () => {
  it('can still open a support ticket, and nothing else', async () => {
    const t = bot();
    await t.sendText('/start');
    const customer = await findCustomerByTelegramId(getDb(), TEST_CUSTOMER_ID);
    if (!customer) throw new Error('missing');
    await setBanned(getDb(), { customerId: customer.id, banned: true, actor: OWNER });

    await t.sendText('/start');
    expect(JSON.stringify(t.callsOf('sendMessage').at(-1)?.payload.reply_markup)).toContain(
      cb.support,
    );
    await t.pressButton(cb.shop);
    expect(t.callsOf('answerCallbackQuery').at(-1)?.payload).toMatchObject({ show_alert: true });

    await t.pressButton('tk:new');
    await t.pressButton('tk:t:general');
    await t.sendText('چرا مسدود شدم؟');
    expect(t.sentTo(OWNER).at(-1)).toContain('چرا مسدود شدم؟');
    await updateSetting(getDb(), 'forcedJoin', false);
  });
});
