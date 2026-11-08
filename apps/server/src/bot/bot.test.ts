import { toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { purchase } from '../modules/orders/index.js';
import { createAdjustment } from '../modules/wallet/index.js';
import { testCipher } from '../test/cipher.js';
import { seedTestCatalog } from '../test/fixtures.js';
import { type ApiCall, createTestBot } from '../test/bot.js';
import { useTestDb } from '../test/db.js';
import { findCustomerByTelegramId, setBanned } from '../modules/customers/index.js';
import { updateSetting } from '../modules/settings/index.js';
import { cb } from './keyboards.js';

const getDb = useTestDb();

function buttonsOf(call: ApiCall | undefined): string[] {
  if (!call) throw new Error('expected an API call');
  const markup = call.payload.reply_markup as { inline_keyboard: { text: string }[][] };
  return markup.inline_keyboard.flat().map((button) => button.text);
}

describe('/start', () => {
  it('registers the customer and shows the welcome with balance and main menu', async () => {
    const t = createTestBot(getDb(), { channelId: '@abis_channel' });
    await t.sendText('/start');

    expect(await findCustomerByTelegramId(getDb(), 1000)).toBeDefined();
    const [reply] = t.callsOf('sendMessage');
    expect(reply?.payload.text).toContain('User1000');
    expect(reply?.payload.text).toContain('۰ تومان');
    expect(buttonsOf(reply)).toEqual([
      '🛍 فروشگاه',
      '💳 شارژ کیف پول',
      '👤 حساب من',
      '🎧 پشتیبانی',
      '📢 کانال ما',
    ]);
  });

  it('omits the channel button when no public channel is configured', async () => {
    const t = createTestBot(getDb());
    await t.sendText('/start');
    expect(buttonsOf(t.callsOf('sendMessage')[0])).not.toContain('📢 کانال ما');
  });
});

describe('main menu', () => {
  it('shows the account screen in place', async () => {
    const t = createTestBot(getDb());
    await t.pressButton(cb.account);
    const [edit] = t.callsOf('editMessageText');
    expect(edit?.payload.text).toContain('حساب من');
    expect(edit?.payload.text).toContain('ثبت نشده');
    expect(edit?.payload.text).not.toContain('تراکنش‌های اخیر');
  });

  it('lists active subscriptions with their expiry on the account screen', async () => {
    const c = await seedTestCatalog(getDb());
    const t = createTestBot(getDb());
    await t.sendText('/start');
    const customer = await findCustomerByTelegramId(getDb(), 1000);
    if (!customer) throw new Error('customer missing');
    await createAdjustment(getDb(), {
      customerId: customer.id,
      amount: toman(2_000_000),
      reason: 'funds',
      actor: 1,
    });
    await purchase(getDb(), testCipher, {
      customerId: customer.id,
      variantId: c.gemini12m.id,
      quantity: 1,
      requestKey: 'k',
    });
    await t.pressButton(cb.account);
    const text = String(t.callsOf('editMessageText').at(-1)?.payload.text);
    expect(text).toContain('اشتراک‌های فعال');
    expect(text).toContain('Gemini Pro · ۱۲ ماهه — تا');
  });

  it('lists recent transactions on the account screen', async () => {
    const t = createTestBot(getDb());
    await t.sendText('/start');
    const customer = await findCustomerByTelegramId(getDb(), 1000);
    if (!customer) throw new Error('customer missing');
    await createAdjustment(getDb(), {
      customerId: customer.id,
      amount: toman(250_000),
      reason: 'gift',
      actor: 1,
    });
    await t.pressButton(cb.account);
    const text = String(t.callsOf('editMessageText').at(-1)?.payload.text);
    expect(text).toContain('تراکنش‌های اخیر');
    expect(text).toContain('➕ ۲۵۰٬۰۰۰ تومان · اصلاحیه');
  });
});

describe('banned customers', () => {
  it('cannot use the bot', async () => {
    const t = createTestBot(getDb());
    await t.sendText('/start');
    const customer = await findCustomerByTelegramId(getDb(), 1000);
    if (!customer) throw new Error('customer missing');
    await setBanned(getDb(), { customerId: customer.id, banned: true, actor: 1 });
    await t.sendText('/start');
    expect(t.sentTo(1000).at(-1)).toContain('مسدود');
    await t.pressButton(cb.shop);
    expect(t.callsOf('answerCallbackQuery').at(-1)?.payload).toMatchObject({ show_alert: true });
    expect(t.callsOf('editMessageText')).toHaveLength(0);
  });
});

describe('forced join', () => {
  it('blocks non-members when enabled', async () => {
    await updateSetting(getDb(), 'forcedJoin', true);
    const t = createTestBot(getDb(), {
      channelId: '@abis_channel',
      responses: { getChatMember: { status: 'left' } },
    });
    await t.sendText('/start');
    const [reply] = t.callsOf('sendMessage');
    expect(reply?.payload.text).toContain('عضو شوید');
    expect(buttonsOf(reply)).toEqual(['📢 عضویت در کانال', '✅ عضو شدم']);
  });

  it('lets members through', async () => {
    await updateSetting(getDb(), 'forcedJoin', true);
    const t = createTestBot(getDb(), {
      channelId: '@abis_channel',
      responses: { getChatMember: { status: 'member' } },
    });
    await t.sendText('/start');
    expect(t.callsOf('sendMessage')[0]?.payload.text).toContain('خوش آمدید');
  });

  it('alerts when "joined" is pressed but the user is still not a member', async () => {
    await updateSetting(getDb(), 'forcedJoin', true);
    const t = createTestBot(getDb(), {
      channelId: '@abis_channel',
      responses: { getChatMember: { status: 'left' } },
    });
    await t.pressButton(cb.joinCheck);
    expect(t.callsOf('answerCallbackQuery')[0]?.payload).toMatchObject({ show_alert: true });
    expect(t.callsOf('editMessageText')).toHaveLength(0);
  });

  it('is skipped when disabled', async () => {
    const t = createTestBot(getDb(), { channelId: '@abis_channel' });
    await t.sendText('/start');
    expect(t.callsOf('getChatMember')).toHaveLength(0);
  });
});
