import { describe, expect, it } from 'vitest';
import { findCustomerByTelegramId } from '../modules/customers/index.js';
import { addBankCard, setActiveBankCard, updateSetting } from '../modules/settings/index.js';
import { getBalance } from '../modules/wallet/index.js';
import { TEST_CUSTOMER_ID, createTestBot } from '../test/bot.js';
import { useTestDb } from '../test/db.js';
import { cb } from './keyboards.js';
import { parseAmount } from './topup.js';

const getDb = useTestDb();
const ADMIN_A = 1;
const ADMIN_B = 2;

async function withActiveCard() {
  const card = await addBankCard(getDb(), ADMIN_A, {
    number: '6037990000000006',
    holderName: 'Reza A',
    bankName: 'ملی',
  });
  await setActiveBankCard(getDb(), ADMIN_A, card.id);
  await updateSetting(getDb(), 'requirePhone', false);
}

function bot() {
  return createTestBot(getDb(), { ownerIds: [ADMIN_A, ADMIN_B] });
}

/** Walks the customer through amount → receipt and returns the bot. */
async function submitTopup(t: ReturnType<typeof bot>, amount: string, image = 'receipt-1') {
  await t.pressButton(cb.topup);
  await t.sendText(amount);
  await t.sendPhoto(image);
}

async function customerBalance() {
  const customer = await findCustomerByTelegramId(getDb(), TEST_CUSTOMER_ID);
  return customer ? getBalance(getDb(), customer.id) : 0;
}

describe('parseAmount', () => {
  it('accepts Latin, Persian and grouped digits', () => {
    expect(parseAmount('500000')).toBe(500_000);
    expect(parseAmount('۱٬۵۰۰٬۰۰۰ تومان')).toBe(1_500_000);
    expect(parseAmount('1,000,000')).toBe(1_000_000);
  });
  it('rejects non-numbers', () => {
    expect(parseAmount('پونصد')).toBeUndefined();
    expect(parseAmount('12.5')).toBeUndefined();
  });
});

describe('customer top-up flow', () => {
  it('is unavailable without an active card', async () => {
    const t = bot();
    await t.pressButton(cb.topup);
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('موقتاً در دسترس نیست');
  });

  it('asks for the phone first when required and only accepts the user’s own contact', async () => {
    await withActiveCard();
    await updateSetting(getDb(), 'requirePhone', true);
    const t = bot();
    await t.pressButton(cb.topup);
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('شماره موبایل');

    await t.sendContact('+989120000000', 9999);
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('شماره‌ی خودتان');

    await t.sendContact('+989120000000');
    const customer = await findCustomerByTelegramId(getDb(), TEST_CUSTOMER_ID);
    expect(customer?.phone).toBe('+989120000000');
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('مبلغ شارژ');
  });

  it('rejects amounts outside the limits and shows the card for a valid one', async () => {
    await withActiveCard();
    const t = bot();
    await t.pressButton(cb.topup);
    await t.sendText('1000');
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('باید عددی بین');
    await t.sendText('۵۰۰٬۰۰۰');
    const shown = t.sentTo(TEST_CUSTOMER_ID).at(-1);
    expect(shown).toContain('۵۰۰٬۰۰۰ تومان');
    expect(shown).toContain('6037-9900-0000-0006');
  });

  it('records the receipt and alerts every admin with decision buttons', async () => {
    await withActiveCard();
    const t = bot();
    await submitTopup(t, '500000');
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('رسید شما ثبت شد');
    const alerts = t.callsOf('sendPhoto');
    expect(alerts.map((a) => a.payload.chat_id)).toEqual([ADMIN_A, ADMIN_B]);
    expect(alerts[0]?.payload.photo).toBe('big-receipt-1');
    expect(String(alerts[0]?.payload.caption)).toContain('۵۰۰٬۰۰۰ تومان');
  });

  it('warns admins about a re-used receipt image', async () => {
    await withActiveCard();
    const t = bot();
    await submitTopup(t, '500000', 'same');
    await submitTopup(t, '500000', 'same');
    expect(String(t.callsOf('sendPhoto').at(-1)?.payload.caption)).toContain('قبلاً در درخواست');
  });

  it('cancel clears the step so later text is not taken as an amount', async () => {
    await withActiveCard();
    const t = bot();
    await t.pressButton(cb.topup);
    await t.pressButton('ta:cancel');
    await t.sendText('500000');
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).not.toContain('6037');
  });
});

describe('admin decisions from the alert', () => {
  it('approve credits the wallet, tells the customer and updates both admins’ alerts', async () => {
    await withActiveCard();
    const t = bot();
    await submitTopup(t, '500000');
    await t.pressButton('tp:a:1', ADMIN_A);

    expect(await customerBalance()).toBe(500_000);
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('تأیید شد');
    const edits = t.callsOf('editMessageCaption');
    expect(edits.map((e) => e.payload.chat_id)).toEqual([ADMIN_A, ADMIN_B]);
    expect(String(edits[0]?.payload.caption)).toContain('تأیید شد');
  });

  it('the second admin to press approve gets "already handled" and no double credit', async () => {
    await withActiveCard();
    const t = bot();
    await submitTopup(t, '500000');
    await t.pressButton('tp:a:1', ADMIN_A);
    await t.pressButton('tp:a:1', ADMIN_B);

    expect(await customerBalance()).toBe(500_000);
    const answers = t.callsOf('answerCallbackQuery').map((a) => a.payload.text);
    expect(answers).toContain('این درخواست قبلاً بررسی شده است.');
  });

  it('reject with a preset reason informs the customer and credits nothing', async () => {
    await withActiveCard();
    const t = bot();
    await submitTopup(t, '500000');
    await t.pressButton('tp:r:1', ADMIN_B);
    expect(t.callsOf('editMessageReplyMarkup')).toHaveLength(1);
    await t.pressButton('tp:x:1:0', ADMIN_B);

    expect(await customerBalance()).toBe(0);
    expect(t.sentTo(TEST_CUSTOMER_ID).at(-1)).toContain('واریزی با این مشخصات پیدا نشد');
  });

  it('ignores decision buttons pressed by non-admins', async () => {
    await withActiveCard();
    const t = bot();
    await submitTopup(t, '500000');
    await t.pressButton('tp:a:1', TEST_CUSTOMER_ID);
    expect(await customerBalance()).toBe(0);
  });
});
