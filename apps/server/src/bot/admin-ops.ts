import { Composer, InlineKeyboard } from 'grammy';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import { resolveAdmin } from '../modules/admins/index.js';
import { getCustomer } from '../modules/customers/index.js';
import { findNotificationEntity } from '../modules/notifications/index.js';
import {
  type OrderDecision,
  deliverOrder,
  getOrder,
  readCustomerInput,
  rejectOrder,
} from '../modules/orders/index.js';
import { addAdminReply, closeTicket } from '../modules/tickets/index.js';
import type { BotContext } from './context.js';
import { cb } from './keyboards.js';
import { announceOrderDecision, orderAlertKeyboard } from './order-alerts.js';
import { notifyTicketClosed, supportCb } from './support.js';
import { orderRejectReasons, texts } from './texts.js';

/**
 * Admin actions done in the chat instead of the panel:
 * deliver / reject queued orders from their alert, peek at a customer password
 * (as a popup, never stored in the chat), and answer tickets by replying to the alert.
 */
export function adminOpsComposer(
  db: Db,
  cipher: Cipher,
  ownerIds: readonly number[],
): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  const isAdmin = async (ctx: BotContext) =>
    ctx.from !== undefined && (await resolveAdmin(db, ownerIds, ctx.from.id)) !== undefined;
  const admin = composer.filter(isAdmin);

  // Non-admins pressing an order-alert button.
  composer
    .callbackQuery(/^od:/)
    .drop(isAdmin, (ctx) => ctx.answerCallbackQuery({ text: texts.notAdmin, show_alert: true }));

  async function decided(ctx: BotContext, result: OrderDecision) {
    if (!result.ok) {
      await ctx.reply(texts.orderAlreadyHandled);
      return false;
    }
    await announceOrderDecision(ctx.api, db, cipher, result.order, result.balance);
    return true;
  }

  admin.callbackQuery(/^od:d:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const order = await getOrder(db, Number(ctx.match[1]));
    if (order?.status !== 'queued') return ctx.reply(texts.orderAlreadyHandled);
    ctx.session = { step: 'admin_deliver', adminOrderId: order.id };
    await ctx.reply(texts.askDeliveryNote(order.id));
  });

  admin.callbackQuery(/^od:r:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const orderId = Number(ctx.match[1]);
    const keyboard = new InlineKeyboard();
    orderRejectReasons.forEach((reason, i) => keyboard.text(reason, `od:x:${orderId}:${i}`).row());
    keyboard.text(texts.buttons.back, `od:b:${orderId}`);
    await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
  });

  admin.callbackQuery(/^od:b:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const order = await getOrder(db, Number(ctx.match[1]));
    if (!order) return;
    await ctx.editMessageReplyMarkup({
      reply_markup: orderAlertKeyboard(
        order.id,
        readCustomerInput(cipher, order).password !== undefined,
      ),
    });
  });

  admin.callbackQuery(/^od:x:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const reason = orderRejectReasons[Number(ctx.match[2])];
    if (!reason) return;
    await decided(
      ctx,
      await rejectOrder(db, { orderId: Number(ctx.match[1]), actor: ctx.from.id, reason }),
    );
  });

  admin.callbackQuery(/^od:p:(\d+)$/, async (ctx) => {
    const order = await getOrder(db, Number(ctx.match[1]));
    const password = order ? readCustomerInput(cipher, order).password : undefined;
    await ctx.answerCallbackQuery({
      text: password ? texts.passwordPopup(password) : texts.passwordGone,
      show_alert: true,
    });
  });

  admin.callbackQuery(/^tk:ac:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const ticket = await closeTicket(db, { ticketId: Number(ctx.match[1]), actor: ctx.from.id });
    if (!ticket) return;
    await notifyTicketClosed(ctx.api, db, ticket);
    await ctx.reply(texts.ticketClosed(ticket.id));
  });

  admin.command('cancel', async (ctx, next) => {
    if (ctx.session.step !== 'admin_deliver') return next();
    ctx.session = {};
    await ctx.reply(texts.adminCancelled);
  });

  // The delivery message an admin was asked for.
  admin.on('message:text', async (ctx, next) => {
    if (ctx.session.step !== 'admin_deliver' || ctx.message.text.startsWith('/')) return next();
    const orderId = ctx.session.adminOrderId;
    ctx.session = {};
    if (!orderId) return;
    const delivered = await decided(
      ctx,
      await deliverOrder(db, cipher, { orderId, actor: ctx.from.id, note: ctx.message.text }),
    );
    if (delivered) await ctx.reply(texts.orderDeliveredByYou(orderId));
  });

  // A Reply to a ticket alert goes straight to the customer.
  admin.on('message:text', async (ctx, next) => {
    const repliedTo = ctx.message.reply_to_message;
    if (!repliedTo) return next();
    const entity = await findNotificationEntity(db, ctx.chat.id, repliedTo.message_id);
    if (entity?.type !== 'ticket') return next();

    const ticket = await addAdminReply(db, {
      ticketId: entity.id,
      actor: ctx.from.id,
      text: ctx.message.text,
    });
    const customer = await getCustomer(db, ticket.customerId);
    if (customer) {
      await ctx.api
        .sendMessage(
          customer.telegramId,
          texts.ticketReplyToCustomer(ticket.id, ctx.message.text),
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text(texts.buttons.replyTicket, supportCb.reply(ticket.id))
              .primary()
              .text(texts.buttons.closeTicket, supportCb.close(ticket.id))
              .row()
              .text(texts.buttons.home, cb.home),
          },
        )
        .catch((error: unknown) => console.error('Could not deliver ticket reply:', error));
    }
    await ctx.reply(texts.ticketReplySent(ticket.id), {
      reply_markup: new InlineKeyboard().text(texts.buttons.closeTicketAdmin, `tk:ac:${ticket.id}`),
    });
  });

  return composer;
}
