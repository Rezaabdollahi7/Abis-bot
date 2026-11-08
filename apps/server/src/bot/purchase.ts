import { randomUUID } from 'node:crypto';
import { type RequiredFieldName, toman } from '@abis/shared';
import { Composer, InlineKeyboard } from 'grammy';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import { getVariantView, usesStock } from '../modules/catalog/index.js';
import { MAX_QUANTITY, purchase, validateInput } from '../modules/orders/index.js';
import { getBalance } from '../modules/wallet/index.js';
import type { BotContext } from './context.js';
import { cb, shopCb, shopCbPattern } from './keyboards.js';
import { alertAdminsOfQueuedOrder, alertIfLowStock } from './order-alerts.js';
import type { SessionData } from './session.js';
import { texts } from './texts.js';

const QUANTITY_OPTIONS = [1, 2, 3, 5, 10];
export const purchaseCb = {
  quantity: (variantId: number, n: number) => `qty:${variantId}:${n}`,
  pay: (key: string) => `pay:${key}`,
};

type Draft = NonNullable<SessionData['order']>;

/**
 * Buy flow: [quantity | required fields] → pre-invoice → pay from wallet.
 * The pre-invoice carries a one-time key; the orders module refuses a second use.
 */
export function purchaseComposer(
  db: Db,
  cipher: Cipher,
  ownerIds: readonly number[],
): Composer<BotContext> {
  const composer = new Composer<BotContext>();

  composer.callbackQuery(shopCbPattern.buy, async (ctx) => {
    await ctx.answerCallbackQuery();
    const view = await getVariantView(db, Number(ctx.match[1]));
    if (!view) return ctx.reply(texts.notAvailable);

    if (usesStock(view.product.deliveryMethod)) {
      const max = Math.min(view.stock ?? 0, MAX_QUANTITY);
      if (max <= 1) return confirm(ctx, { variantId: view.variant.id, quantity: 1, values: {} });
      const keyboard = new InlineKeyboard();
      QUANTITY_OPTIONS.filter((n) => n <= max).forEach((n) =>
        keyboard.text(texts.buttons.quantity(n), purchaseCb.quantity(view.variant.id, n)),
      );
      keyboard
        .row()
        .text(texts.buttons.back, shopCb.variant(view.variant.id))
        .text(texts.buttons.home, cb.home);
      return ctx.editMessageText(texts.chooseQuantity(view.product.name, view.stock ?? 0), {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    }

    const draft: Draft = { variantId: view.variant.id, quantity: 1, values: {} };
    return askNextField(ctx, draft, view.product.requiredFields);
  });

  composer.callbackQuery(/^qty:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await confirm(ctx, {
      variantId: Number(ctx.match[1]),
      quantity: Number(ctx.match[2]),
      values: {},
    });
  });

  async function askNextField(ctx: BotContext, draft: Draft, fields: RequiredFieldName[]) {
    const missing = fields.find((f) => draft.values[f] === undefined);
    if (!missing) return confirm(ctx, draft);
    ctx.session = { step: 'order_input', order: draft };
    await ctx.reply(texts.askField[missing], {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text(texts.buttons.cancel, cb.home),
    });
  }

  composer.on('message:text', async (ctx, next) => {
    const draft = ctx.session.order;
    if (ctx.session.step !== 'order_input' || !draft || ctx.message.text.startsWith('/')) {
      return next();
    }
    const view = await getVariantView(db, draft.variantId);
    if (!view) {
      ctx.session = {};
      return ctx.reply(texts.notAvailable);
    }
    const field = view.product.requiredFields.find((f) => draft.values[f] === undefined);
    if (!field) return confirm(ctx, draft);

    const value = ctx.message.text.trim();
    if (field === 'password') {
      // Do not leave the password sitting in the chat history.
      await ctx.deleteMessage().catch(() => undefined);
    }
    if (validateInput([field], { [field]: value })) {
      return ctx.reply(texts.invalidField[field]);
    }
    await askNextField(
      ctx,
      { ...draft, values: { ...draft.values, [field]: value } },
      view.product.requiredFields,
    );
  });

  async function confirm(ctx: BotContext, draft: Draft) {
    const view = await getVariantView(db, draft.variantId);
    if (!view) {
      ctx.session = {};
      return ctx.reply(texts.notAvailable);
    }
    const total = toman(view.variant.priceToman * draft.quantity);
    const balance = await getBalance(db, ctx.customer.id);
    const key = randomUUID().slice(0, 12);
    ctx.session = { order: { ...draft, key } };

    const keyboard = new InlineKeyboard();
    if (balance >= total) {
      keyboard.text(texts.buttons.pay(total), purchaseCb.pay(key)).success();
    } else {
      keyboard
        .text(texts.buttons.topupShortfall(toman(total - balance)), `tq:${total - balance}`)
        .primary();
    }
    keyboard.row().text(texts.buttons.cancel, cb.home);
    const text = texts.confirmOrder({
      view,
      quantity: draft.quantity,
      total,
      balance,
      values: draft.values,
    });
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  }

  composer.callbackQuery(/^pay:([\w-]+)$/, async (ctx) => {
    const draft = ctx.session.order;
    if (!draft?.key || draft.key !== ctx.match[1]) {
      return ctx.answerCallbackQuery({ text: texts.confirmExpired, show_alert: true });
    }
    const result = await purchase(db, cipher, {
      customerId: ctx.customer.id,
      variantId: draft.variantId,
      quantity: draft.quantity,
      customerInput: draft.values,
      requestKey: draft.key,
    });
    ctx.session = {};

    if (!result.ok) {
      switch (result.reason) {
        case 'duplicate':
          return ctx.answerCallbackQuery({ text: texts.alreadyOrdered, show_alert: true });
        case 'not_enough_stock':
          return ctx.answerCallbackQuery({
            text: texts.notEnoughStock(result.available),
            show_alert: true,
          });
        case 'insufficient_balance':
          await ctx.answerCallbackQuery();
          return confirm(ctx, {
            variantId: draft.variantId,
            quantity: draft.quantity,
            values: draft.values,
          });
        default:
          return ctx.answerCallbackQuery({ text: texts.notAvailable, show_alert: true });
      }
    }

    await ctx.answerCallbackQuery();
    const home = new InlineKeyboard().text(texts.buttons.home, cb.home);
    const name = `${result.product.name}`;
    if (result.order.status === 'delivered') {
      await ctx.editMessageText(texts.orderDelivered(result.order.id, name, result.balance), {
        parse_mode: 'HTML',
      });
      await ctx.reply(texts.deliveredItems(result.items), {
        parse_mode: 'HTML',
        reply_markup: home,
      });
      await alertIfLowStock(ctx.api, db, ownerIds, result);
    } else {
      await ctx.editMessageText(
        texts.orderQueued(result.order.id, name, result.product.etaMinutes, result.balance),
        { parse_mode: 'HTML', reply_markup: home },
      );
      await alertAdminsOfQueuedOrder(ctx.api, db, ownerIds, cipher, result.order);
    }
  });

  return composer;
}
