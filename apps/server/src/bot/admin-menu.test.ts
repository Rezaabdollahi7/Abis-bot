import { toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { getVariantView } from '../modules/catalog/index.js';
import { findCustomerByTelegramId, registerCustomer } from '../modules/customers/index.js';
import { getActiveBankCard, getSettings, listBankCards } from '../modules/settings/index.js';
import { countAvailable } from '../modules/stock/index.js';
import { createAdjustment, getBalance } from '../modules/wallet/index.js';
import { createTestBot } from '../test/bot.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';

const getDb = useTestDb();
const OWNER = 1;
const CUSTOMER = 777;
const bot = () => createTestBot(getDb(), { ownerIds: [OWNER] });
type TestBot = ReturnType<typeof bot>;

function lastText(t: TestBot): string {
  const last = t.calls
    .filter((c) => c.method === 'sendMessage' || c.method === 'editMessageText')
    .at(-1);
  return String(last?.payload.text ?? '');
}
function lastButtons(t: TestBot): string[] {
  const last = t.calls.filter((c) => c.payload.reply_markup).at(-1);
  const markup = last?.payload.reply_markup as { inline_keyboard?: { callback_data?: string }[][] };
  return (markup.inline_keyboard ?? [])
    .flat()
    .flatMap((b) => (b.callback_data ? [b.callback_data] : []));
}

describe('/admin', () => {
  it('opens for admins with a summary and is refused to others', async () => {
    const t = bot();
    await t.sendText('/admin', OWNER);
    expect(lastText(t)).toContain('مدیریت فروشگاه');
    expect(lastButtons(t)).toEqual(
      expect.arrayContaining([
        'am:topups',
        'am:orders',
        'am:tickets',
        'am:cust',
        'am:bc',
        'am:cat',
        'am:cards',
        'am:set',
      ]),
    );
    await t.pressButton('am:cust', CUSTOMER);
    expect(t.callsOf('answerCallbackQuery').at(-1)?.payload).toMatchObject({ show_alert: true });
  });

  it('finds a customer and credits their wallet with a reason', async () => {
    const customer = await registerCustomer(getDb(), {
      telegramId: CUSTOMER,
      firstName: 'Sara',
      username: 'sara',
    });
    const t = bot();
    await t.pressButton('am:cust', OWNER);
    await t.sendText('@sara', OWNER);
    expect(lastText(t)).toContain('Sara');
    await t.pressButton(`am:cadj:${customer.id}:p`, OWNER);
    await t.sendText('۲۰۰٬۰۰۰ جبران تأخیر', OWNER);
    expect(await getBalance(getDb(), customer.id)).toBe(200_000);
    expect(t.sentTo(CUSTOMER).at(-1)).toContain('جبران تأخیر');
  });

  it('refuses a debit larger than the balance', async () => {
    const customer = await registerCustomer(getDb(), { telegramId: CUSTOMER, firstName: 'Sara' });
    await createAdjustment(getDb(), {
      customerId: customer.id,
      amount: toman(1000),
      reason: 'x',
      actor: OWNER,
    });
    const t = bot();
    await t.pressButton(`am:cadj:${customer.id}:m`, OWNER);
    await t.sendText('5000 تسویه', OWNER);
    expect(lastText(t)).toContain('کافی نیست');
  });

  it('bans from the customer card', async () => {
    const customer = await registerCustomer(getDb(), { telegramId: CUSTOMER, firstName: 'Sara' });
    const t = bot();
    await t.pressButton(`am:cban:${customer.id}`, OWNER);
    expect((await findCustomerByTelegramId(getDb(), CUSTOMER))?.isBanned).toBe(true);
  });

  it('previews a broadcast and sends it only after confirmation', async () => {
    await registerCustomer(getDb(), { telegramId: CUSTOMER, firstName: 'Sara' });
    const t = bot();
    await t.pressButton('am:bc', OWNER);
    await t.sendText('محصول جدید رسید 🎉', OWNER);
    expect(lastText(t)).toContain('پیش‌نمایش');
    expect(t.sentTo(CUSTOMER)).toEqual([]);
    await t.pressButton('am:bcs', OWNER);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(t.sentTo(CUSTOMER)).toContain('محصول جدید رسید 🎉');
  });

  it('changes a price and adds stock (deleting the pasted message)', async () => {
    const c = await seedTestCatalog(getDb());
    const t = bot();
    await t.pressButton(`am:v:${c.gemini12m.id}`, OWNER);
    expect(lastButtons(t)).toContain(`am:vs:${c.gemini12m.id}`);

    await t.pressButton(`am:vp:${c.gemini12m.id}`, OWNER);
    await t.sendText('1,700,000', OWNER);
    expect((await getVariantView(getDb(), c.gemini12m.id))?.variant.priceToman).toBe(1_700_000);

    await t.pressButton(`am:vs:${c.gemini12m.id}`, OWNER);
    await t.sendText('https://x/1\nhttps://x/2', OWNER);
    expect((await countAvailable(getDb(), [c.gemini12m.id])).get(c.gemini12m.id)).toBe(4);
    expect(t.callsOf('deleteMessage')).toHaveLength(1);
  });

  it('adds and activates a bank card', async () => {
    const t = bot();
    await t.pressButton('am:cadd', OWNER);
    await t.sendText('6037-9900-0000-0006\nرضا عبداللهی\nملی', OWNER);
    const [card] = await listBankCards(getDb());
    expect(card?.number).toBe('6037990000000006');
    await t.pressButton(`am:ca:${card?.id}`, OWNER);
    expect((await getActiveBankCard(getDb()))?.id).toBe(card?.id);
  });

  it('toggles and edits settings', async () => {
    const t = bot();
    await t.pressButton('am:st:forcedJoin', OWNER);
    expect((await getSettings(getDb())).forcedJoin).toBe(true);
    await t.pressButton('am:se:topupMinToman', OWNER);
    await t.sendText('100000', OWNER);
    expect((await getSettings(getDb())).topupMinToman).toBe(100_000);
  });
});
