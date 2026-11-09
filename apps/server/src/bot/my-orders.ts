import { toman } from '@abis/shared';
import { Composer, InlineKeyboard } from 'grammy';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import { getCustomerOrder, listCustomerOrders, readDeliveryNote } from '../modules/orders/index.js';
import { getOrderItems } from '../modules/stock/index.js';
import type { BotContext } from './context.js';
import { cb, shopCb } from './keyboards.js';
import { orderProductLine } from './order-alerts.js';
import { supportCb } from './support.js';
import { texts } from './texts.js';

export const myOrdersCb = { list: 'myorders', detail: (id: number) => `mo:${id}` };

/** «خریدهای من»: every order with its status, delivered links/accounts and admin notes. */
export function myOrdersComposer(db: Db, cipher: Cipher): Composer<BotContext> {
  const composer = new Composer<BotContext>();

  composer.callbackQuery(myOrdersCb.list, async (ctx) => {
    await ctx.answerCallbackQuery();
    const orders = await listCustomerOrders(db, ctx.customer.id, 15);
    const keyboard = new InlineKeyboard();
    for (const o of orders) {
      keyboard
        .text(
          texts.myOrderButton(o.id, await orderProductLine(db, o), o.status),
          myOrdersCb.detail(o.id),
        )
        .row();
    }
    keyboard.text(texts.buttons.back, cb.account).text(texts.buttons.home, cb.home);
    await ctx.editMessageText(texts.myOrdersTitle(orders.length), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  });

  composer.callbackQuery(/^mo:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const found = await getCustomerOrder(db, ctx.customer.id, Number(ctx.match[1]));
    if (!found) return;
    const { order, subscription } = found;
    const items = order.status === 'delivered' ? await getOrderItems(db, cipher, order.id) : [];
    const keyboard = new InlineKeyboard();
    if (order.status === 'delivered')
      keyboard.text(texts.buttons.renew, shopCb.variant(order.variantId));
    keyboard
      .text(texts.buttons.orderSupport, supportCb.order(order.id))
      .row()
      .text(texts.buttons.back, myOrdersCb.list)
      .text(texts.buttons.home, cb.home);
    await ctx.editMessageText(
      texts.myOrderDetail({
        id: order.id,
        line: await orderProductLine(db, order),
        quantity: order.quantity,
        total: toman(order.totalToman),
        status: order.status,
        createdAt: order.createdAt,
        expiresAt: subscription?.expiresAt ?? null,
        items,
        note: order.status === 'delivered' ? readDeliveryNote(cipher, order) : null,
        rejectReason: order.status === 'rejected' ? order.rejectReason : null,
      }),
      { parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: true } },
    );
  });

  return composer;
}
