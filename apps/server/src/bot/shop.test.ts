import { describe, expect, it } from 'vitest';
import { type ApiCall, createTestBot } from '../test/bot.js';
import { useTestDb } from '../test/db.js';
import { seedTestCatalog } from '../test/fixtures.js';
import { cb, shopCb } from './keyboards.js';

const getDb = useTestDb();

function lastEdit(calls: ApiCall[]): { text: string; buttons: string[]; data: string[] } {
  const edit = calls.filter((c) => c.method === 'editMessageText').at(-1);
  if (!edit) throw new Error('expected an editMessageText call');
  const rows = (
    edit.payload.reply_markup as {
      inline_keyboard: { text: string; callback_data?: string }[][];
    }
  ).inline_keyboard;
  return {
    text: String(edit.payload.text),
    buttons: rows.flat().map((b) => b.text),
    data: rows.flat().flatMap((b) => (b.callback_data ? [b.callback_data] : [])),
  };
}

describe('shop', () => {
  it('shows providers and featured variants with price and stock', async () => {
    await seedTestCatalog(getDb());
    const t = createTestBot(getDb());
    await t.pressButton(cb.shop);
    const screen = lastEdit(t.calls);
    expect(screen.text).toContain('فروشگاه');
    expect(screen.buttons.slice(0, 2)).toEqual(['🟢 OpenAI', '🔵 Google']);
    expect(screen.buttons).toContain('🔵 Gemini Pro · ۱۲ ماهه · ۱٬۵۰۰٬۰۰۰ تومان (۲)');
    expect(screen.buttons).toContain('🟢 ChatGPT Plus · ۱ ماهه · ۸۰۰٬۰۰۰ تومان');
  });

  it('says the shop is empty when nothing is for sale', async () => {
    const t = createTestBot(getDb());
    await t.pressButton(cb.shop);
    expect(lastEdit(t.calls).text).toContain('موجود نیست');
  });

  it('navigates provider → product → durations', async () => {
    const c = await seedTestCatalog(getDb());
    const t = createTestBot(getDb());

    await t.pressButton(shopCb.provider(c.openai.id));
    expect(lastEdit(t.calls).buttons).toContain('ChatGPT Plus');

    await t.pressButton(shopCb.product(c.chatgpt.id));
    const durations = lastEdit(t.calls);
    expect(durations.buttons).toContain('۱ ماهه · ۸۰۰٬۰۰۰ تومان');
    expect(durations.buttons).toContain('۳ ماهه · ۲٬۲۰۰٬۰۰۰ تومان');
    expect(durations.data).toContain(shopCb.provider(c.openai.id));
  });

  it('shows an instant-delivery card for a stocked link variant', async () => {
    const c = await seedTestCatalog(getDb());
    const t = createTestBot(getDb());
    await t.pressButton(shopCb.variant(c.gemini12m.id));
    const card = lastEdit(t.calls);
    expect(card.text).toContain('۱٬۵۰۰٬۰۰۰ تومان');
    expect(card.text).toContain('📦 موجودی: ۲ عدد');
    expect(card.text).toContain('تحویل خودکار');
    expect(card.buttons[0]).toBe('🛒 خرید');
  });

  it('shows a manual-delivery card for email activation', async () => {
    const c = await seedTestCatalog(getDb());
    const t = createTestBot(getDb());
    await t.pressButton(shopCb.variant(c.chatgpt1m.id));
    const card = lastEdit(t.calls);
    expect(card.text).toContain('📦 موجودی: موجود');
    expect(card.text).toContain('🛡 گارانتی: ۳۰ روز');
    expect(card.text).toContain('تحویل دستی، حدود ۳۰ دقیقه');
  });

  it('alerts instead of crashing on a stale button', async () => {
    const t = createTestBot(getDb());
    await t.pressButton(shopCb.variant(999));
    expect(t.calls.find((c) => c.method === 'answerCallbackQuery')?.payload).toMatchObject({
      show_alert: true,
    });
  });
});
