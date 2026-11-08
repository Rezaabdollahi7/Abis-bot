import { type Toman, normalizeDigits, toman } from '@abis/shared';
import { Composer, InlineKeyboard, Keyboard } from 'grammy';
import type { Db } from '../db/client.js';
import { setPhone } from '../modules/customers/index.js';
import { getActiveBankCard, getSettings } from '../modules/settings/index.js';
import { createTopup } from '../modules/wallet/index.js';
import type { BotContext } from './context.js';
import { cb } from './keyboards.js';
import { texts } from './texts.js';
import { alertAdminsOfTopup } from './topup-alerts.js';

const PRESET_AMOUNTS = [100_000, 200_000, 500_000, 1_000_000, 2_000_000];
const topupCb = { amount: (n: number) => `ta:${n}`, cancel: 'ta:cancel' };

/** Parses "1,500,000", "۱٬۵۰۰٬۰۰۰" or "1500000 تومان" into Toman; undefined if not a number. */
export function parseAmount(text: string): Toman | undefined {
  const digits = normalizeDigits(text).replace(/تومان|toman/gi, '');
  if (!/^\d{1,12}$/.test(digits)) return undefined;
  return toman(Number(digits));
}

const cancelKeyboard = () => new InlineKeyboard().text(texts.buttons.cancel, topupCb.cancel);

/**
 * Customer top-up conversation: [phone] → amount → card → receipt photo.
 * The step lives in the session so it survives restarts.
 */
export function topupComposer(db: Db, ownerIds: readonly number[]): Composer<BotContext> {
  const topup = new Composer<BotContext>();

  async function start(ctx: BotContext) {
    const [settings, card] = await Promise.all([getSettings(db), getActiveBankCard(db)]);
    if (!card) {
      ctx.session = {};
      return ctx.reply(texts.topupUnavailable, {
        reply_markup: new InlineKeyboard().text(texts.buttons.home, cb.home),
      });
    }
    if (settings.requirePhone && !ctx.customer.phone) {
      ctx.session = { step: 'phone' };
      return ctx.reply(texts.askPhone, {
        reply_markup: new Keyboard()
          .requestContact(texts.buttons.sendPhone)
          .row()
          .text(texts.buttons.cancel)
          .resized()
          .oneTime(),
      });
    }
    return askAmount(ctx);
  }

  async function askAmount(ctx: BotContext) {
    const { topupMinToman, topupMaxToman } = await getSettings(db);
    ctx.session = { step: 'amount' };
    const keyboard = new InlineKeyboard();
    PRESET_AMOUNTS.filter((n) => n >= topupMinToman && n <= topupMaxToman).forEach((n, i) => {
      if (i > 0 && i % 2 === 0) keyboard.row();
      keyboard.text(texts.buttons.amount(toman(n)), topupCb.amount(n));
    });
    keyboard.row().text(texts.buttons.cancel, topupCb.cancel);
    await ctx.reply(texts.askAmount(toman(topupMinToman), toman(topupMaxToman)), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }

  async function chooseAmount(ctx: BotContext, amount: Toman) {
    const [{ topupMinToman, topupMaxToman }, card] = await Promise.all([
      getSettings(db),
      getActiveBankCard(db),
    ]);
    if (amount < topupMinToman || amount > topupMaxToman) {
      return ctx.reply(texts.amountInvalid(toman(topupMinToman), toman(topupMaxToman)));
    }
    if (!card) {
      ctx.session = {};
      return ctx.reply(texts.topupUnavailable);
    }
    ctx.session = { step: 'receipt', topupAmount: amount, topupCardId: card.id };
    await ctx.reply(texts.payToCard(amount, card), {
      parse_mode: 'HTML',
      reply_markup: cancelKeyboard(),
    });
  }

  async function receiveReceipt(ctx: BotContext, fileId: string, fileUniqueId: string) {
    const { topupAmount, topupCardId } = ctx.session;
    if (topupAmount === undefined || topupCardId === undefined) return askAmount(ctx);
    const created = await createTopup(db, {
      customerId: ctx.customer.id,
      amount: toman(topupAmount),
      bankCardId: topupCardId,
      receiptFileId: fileId,
      receiptFileUniqueId: fileUniqueId,
    });
    ctx.session = {};
    await ctx.reply(texts.receiptSaved(created.id), {
      reply_markup: new InlineKeyboard().text(texts.buttons.home, cb.home),
    });
    await alertAdminsOfTopup(ctx.api, db, ownerIds, created);
  }

  async function cancel(ctx: BotContext) {
    ctx.session = {};
    await ctx.reply(texts.cancelled, {
      reply_markup: new InlineKeyboard().text(texts.buttons.home, cb.home),
    });
  }

  topup.callbackQuery(cb.topup, async (ctx) => {
    await ctx.answerCallbackQuery();
    await start(ctx);
  });
  topup.callbackQuery(/^ta:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (ctx.session.step !== 'amount') return start(ctx);
    await chooseAmount(ctx, toman(Number(ctx.match[1])));
  });
  // "Top up the shortfall" from a pre-invoice: skip the amount question when possible.
  topup.callbackQuery(/^tq:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const settings = await getSettings(db);
    if (settings.requirePhone && !ctx.customer.phone) return start(ctx);
    const amount = Math.min(
      Math.max(Number(ctx.match[1]), settings.topupMinToman),
      settings.topupMaxToman,
    );
    await chooseAmount(ctx, toman(amount));
  });

  topup.callbackQuery(topupCb.cancel, async (ctx) => {
    await ctx.answerCallbackQuery();
    await cancel(ctx);
  });

  // Step handlers: only act while the matching step is active.
  topup.on('message:contact', async (ctx, next) => {
    if (ctx.session.step !== 'phone') return next();
    const { contact } = ctx.message;
    if (contact.user_id !== ctx.from.id) return ctx.reply(texts.phoneNotYours);
    await setPhone(db, ctx.customer.id, normalizeDigits(contact.phone_number));
    await ctx.reply(texts.phoneSaved, { reply_markup: { remove_keyboard: true } });
    await askAmount(ctx);
  });

  topup.on('message:text', async (ctx, next) => {
    const { step } = ctx.session;
    const ownStep = step === 'phone' || step === 'amount' || step === 'receipt';
    if (!ownStep || ctx.message.text.startsWith('/')) return next();
    if (ctx.message.text === texts.buttons.cancel) {
      await ctx.reply(texts.cancelled, { reply_markup: { remove_keyboard: true } });
      ctx.session = {};
      return;
    }
    if (step === 'phone') return ctx.reply(texts.askPhone);
    if (step === 'receipt') return ctx.reply(texts.receiptExpected);
    const amount = parseAmount(ctx.message.text);
    const { topupMinToman, topupMaxToman } = await getSettings(db);
    if (amount === undefined) {
      return ctx.reply(texts.amountInvalid(toman(topupMinToman), toman(topupMaxToman)));
    }
    await chooseAmount(ctx, amount);
  });

  topup.on('message:photo', async (ctx, next) => {
    if (ctx.session.step !== 'receipt') return next();
    const largest = ctx.message.photo.at(-1);
    if (!largest) return;
    await receiveReceipt(ctx, largest.file_id, largest.file_unique_id);
  });

  topup.on('message:document', async (ctx, next) => {
    const { document } = ctx.message;
    if (ctx.session.step !== 'receipt' || !document.mime_type?.startsWith('image/')) return next();
    await receiveReceipt(ctx, document.file_id, document.file_unique_id);
  });

  return topup;
}
