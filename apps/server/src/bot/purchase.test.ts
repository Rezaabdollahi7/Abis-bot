import { toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { createProduct, createVariant } from '../modules/catalog/index.js';
import { findCustomerByTelegramId, registerCustomer } from '../modules/customers/index.js';
import { updateSetting } from '../modules/settings/index.js';
import { createAdjustment, getBalance } from '../modules/wallet/index.js';
import { TEST_CUSTOMER_ID, createTestBot } from '../test/bot.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';
import { shopCb } from './keyboards.js';
import { purchaseCb } from './purchase.js';

const getDb = useTestDb();
const OWNER = 1;

async function fund(amount: number) {
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

function bot() {
  return createTestBot(getDb(), { ownerIds: [OWNER] });
}

type TestBot = ReturnType<typeof bot>;

function buttonsOf(t: TestBot): { text: string; data: string | undefined }[] {
  const last = t.calls.filter((c) => c.payload.reply_markup).at(-1);
  const markup = last?.payload.reply_markup as {
    inline_keyboard?: { text: string; callback_data?: string }[][];
  };
  return (markup.inline_keyboard ?? [])
    .flat()
    .map((b) => ({ text: b.text, data: b.callback_data }));
}

function lastText(t: TestBot): string {
  const last = t.calls
    .filter((c) => c.method === 'sendMessage' || c.method === 'editMessageText')
    .at(-1);
  return String(last?.payload.text ?? '');
}

async function pressPay(t: TestBot) {
  const pay = buttonsOf(t).find((b) => b.data?.startsWith('pay:'));
  if (!pay?.data) throw new Error(`no pay button in: ${lastText(t)}`);
  await t.pressButton(pay.data);
  return pay.data;
}

describe('buying a stock-based product', () => {
  it('quantity → pre-invoice → pay delivers the links and charges the wallet', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await fund(5_000_000);
    const t = bot();

    await t.pressButton(shopCb.buy(c.gemini12m.id));
    expect(buttonsOf(t).map((b) => b.text)).toContain('۲');
    await t.pressButton(purchaseCb.quantity(c.gemini12m.id, 2));
    expect(lastText(t)).toContain('۳٬۰۰۰٬۰۰۰ تومان');

    await pressPay(t);
    const messages = t.sentTo(TEST_CUSTOMER_ID).join('\n');
    expect(messages).toContain('<pre>https://gemini.example/a</pre>');
    expect(messages).toContain('<pre>https://gemini.example/b</pre>');
    expect(await getBalance(getDb(), customer.id)).toBe(2_000_000);
  });

  it('a second press of the same pay button does not buy again', async () => {
    const c = await seedTestCatalog(getDb());
    const customer = await fund(5_000_000);
    const t = bot();
    await t.pressButton(shopCb.buy(c.gemini12m.id));
    await t.pressButton(purchaseCb.quantity(c.gemini12m.id, 1));
    const pay = await pressPay(t);
    await t.pressButton(pay);
    expect(await getBalance(getDb(), customer.id)).toBe(3_500_000);
    expect(t.callsOf('answerCallbackQuery').at(-1)?.payload.show_alert).toBe(true);
  });

  it('alerts admins when stock falls to the threshold', async () => {
    const c = await seedTestCatalog(getDb());
    await fund(5_000_000);
    await updateSetting(getDb(), 'lowStockThreshold', 1);
    const t = bot();
    await t.pressButton(shopCb.buy(c.gemini12m.id));
    await t.pressButton(purchaseCb.quantity(c.gemini12m.id, 1));
    await pressPay(t);
    expect(t.sentTo(OWNER).join('\n')).toContain('موجودی رو به اتمام');
  });
});

describe('buying an email-activation product', () => {
  it('collects a valid email, queues the order and alerts admins with the email', async () => {
    const c = await seedTestCatalog(getDb());
    await fund(5_000_000);
    const t = bot();

    await t.pressButton(shopCb.buy(c.chatgpt1m.id));
    expect(lastText(t)).toContain('ایمیل');
    await t.sendText('not-an-email');
    expect(lastText(t)).toContain('معتبر نیست');
    await t.sendText('me@mail.com');
    expect(lastText(t)).toContain('me@mail.com');

    await pressPay(t);
    expect(String(t.callsOf('editMessageText').at(-1)?.payload.text)).toContain('در صف تحویل');
    const alert = t.sentTo(OWNER).join('\n');
    expect(alert).toContain('نیاز به تحویل دستی');
    expect(alert).toContain('me@mail.com');
  });

  it('deletes the password message and never shows the password in alerts', async () => {
    const c = await seedTestCatalog(getDb());
    await fund(5_000_000);
    const product = await createProduct(getDb(), {
      providerId: c.openai.id,
      name: 'Pro',
      deliveryMethod: 'email_activation',
      requiredFields: ['email', 'password'],
    });
    const variant = await createVariant(getDb(), {
      productId: product.id,
      durationDays: 30,
      priceToman: toman(100_000),
    });
    const t = bot();
    await t.pressButton(shopCb.buy(variant.id));
    await t.sendText('me@mail.com');
    await t.sendText('S3cret!pass');
    expect(t.callsOf('deleteMessage')).toHaveLength(1);
    expect(lastText(t)).toContain('••••••');
    await pressPay(t);
    expect(t.sentTo(OWNER).join('\n')).not.toContain('S3cret!pass');
  });
});

describe('insufficient balance', () => {
  it('offers to top up exactly the shortfall', async () => {
    const c = await seedTestCatalog(getDb());
    await fund(500_000);
    const t = bot();
    await t.pressButton(shopCb.buy(c.chatgpt1m.id));
    await t.sendText('me@mail.com');
    expect(lastText(t)).toContain('۳۰۰٬۰۰۰ تومان</b> کم دارید');
    expect(buttonsOf(t).map((b) => b.data)).toContain('tq:300000');
    const customer = await findCustomerByTelegramId(getDb(), TEST_CUSTOMER_ID);
    expect(customer && (await getBalance(getDb(), customer.id))).toBe(500_000);
  });
});
