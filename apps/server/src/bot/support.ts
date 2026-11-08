import { type Api, Composer, InlineKeyboard } from 'grammy';
import type { Db } from '../db/client.js';
import { getCustomer } from '../modules/customers/index.js';
import { recordNotifications } from '../modules/notifications/index.js';
import { listCustomerOrders } from '../modules/orders/index.js';
import {
  type MessageInput,
  type Ticket,
  addCustomerMessage,
  closeTicket,
  getTicket,
  listCustomerTickets,
  listMessages,
  openTicket,
} from '../modules/tickets/index.js';
import type { BotContext } from './context.js';
import { cb } from './keyboards.js';
import { broadcastToAdmins, orderProductLine } from './order-alerts.js';
import { texts } from './texts.js';

export const supportCb = {
  newTicket: 'tk:new',
  topic: (t: 'order' | 'payment' | 'general') => `tk:t:${t}`,
  order: (id: number) => `tk:o:${id}`,
  view: (id: number) => `tk:v:${id}`,
  reply: (id: number) => `tk:r:${id}`,
  close: (id: number) => `tk:c:${id}`,
};

const backHome = () =>
  new InlineKeyboard().text(texts.buttons.back, cb.support).text(texts.buttons.home, cb.home);

/**
 * Tells every admin about a new ticket or a new customer message in one.
 * Attachments are copied to each admin too; both messages accept a Reply as the answer.
 */
export async function alertAdminsOfTicket(
  api: Api,
  db: Db,
  ownerIds: readonly number[],
  ticket: Ticket,
  message: MessageInput,
  isNew: boolean,
  /** Only these chats; default: every admin. */
  recipients?: number[],
): Promise<void> {
  const customer = await getCustomer(db, ticket.customerId);
  const sent = await broadcastToAdmins(
    api,
    db,
    ownerIds,
    texts.ticketAlert({
      ticketId: ticket.id,
      topic: ticket.topic,
      orderId: ticket.orderId,
      customerName: customer?.firstName ?? '?',
      username: customer?.username ?? null,
      isNew,
      text: message.text ?? null,
      hasFile: Boolean(message.fileId),
    }),
    new InlineKeyboard().text(texts.buttons.closeTicketAdmin, `tk:ac:${ticket.id}`),
    recipients,
  );
  if (message.fileId) {
    for (const { chatId } of [...sent]) {
      const caption = `📎 تیکت #${ticket.id}`;
      const file =
        message.fileKind === 'photo'
          ? await api.sendPhoto(chatId, message.fileId, { caption }).catch(() => undefined)
          : await api.sendDocument(chatId, message.fileId, { caption }).catch(() => undefined);
      if (file) sent.push({ chatId, messageId: file.message_id });
    }
  }
  await recordNotifications(db, { type: 'ticket', id: ticket.id }, sent);
}

/** Support: list own tickets, open one (optionally about an order), view, reply, close. */
export function supportComposer(db: Db, ownerIds: readonly number[]): Composer<BotContext> {
  const support = new Composer<BotContext>();

  support.callbackQuery(cb.support, async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session = {};
    const open = await listCustomerTickets(db, ctx.customer.id);
    const keyboard = new InlineKeyboard();
    for (const t of open) {
      keyboard.text(texts.ticketButton(t.id, t.topic, t.status), supportCb.view(t.id)).row();
    }
    keyboard
      .text(texts.buttons.newTicket, supportCb.newTicket)
      .primary()
      .row()
      .text(texts.buttons.home, cb.home);
    await ctx.editMessageText(texts.supportHome(open.length), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  });

  support.callbackQuery(supportCb.newTicket, async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard();
    for (const topic of ['order', 'payment', 'general'] as const) {
      keyboard.text(texts.buttons.topic(topic), supportCb.topic(topic)).row();
    }
    await ctx.editMessageText(texts.chooseTopic, { reply_markup: keyboard.append(backHome()) });
  });

  support.callbackQuery(/^tk:t:(order|payment|general)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const topic = ctx.match[1] as 'order' | 'payment' | 'general';
    if (topic === 'order') {
      const orders = await listCustomerOrders(db, ctx.customer.id);
      if (orders.length > 0) {
        const keyboard = new InlineKeyboard();
        for (const o of orders) {
          keyboard
            .text(texts.orderButton(o.id, await orderProductLine(db, o)), supportCb.order(o.id))
            .row();
        }
        keyboard.text(texts.buttons.noOrder, supportCb.order(0)).row();
        return ctx.editMessageText(texts.chooseOrder, {
          reply_markup: keyboard.append(backHome()),
        });
      }
    }
    await askFirstMessage(ctx, { topic });
  });

  support.callbackQuery(/^tk:o:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const orderId = Number(ctx.match[1]);
    const owned = (await listCustomerOrders(db, ctx.customer.id, 50)).some((o) => o.id === orderId);
    await askFirstMessage(ctx, owned ? { topic: 'order', orderId } : { topic: 'order' });
  });

  async function askFirstMessage(
    ctx: BotContext,
    ticket: { topic: 'order' | 'payment' | 'general'; orderId?: number },
  ) {
    ctx.session = { step: 'ticket_new', ticket };
    await ctx.editMessageText(texts.writeTicket, { parse_mode: 'HTML', reply_markup: backHome() });
  }

  support.callbackQuery(/^tk:v:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const ticket = await getTicket(db, Number(ctx.match[1]));
    if (ticket?.customerId !== ctx.customer.id) return;
    const messages = await listMessages(db, ticket.id);
    await ctx.editMessageText(
      texts.ticketView(
        ticket.id,
        ticket.topic,
        messages.map((m) => ({
          fromAdmin: m.fromAdminTelegramId !== null,
          text: m.text,
          hasFile: m.fileId !== null,
        })),
      ),
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text(texts.buttons.replyTicket, supportCb.reply(ticket.id))
          .primary()
          .text(texts.buttons.closeTicket, supportCb.close(ticket.id))
          .row()
          .append(backHome()),
      },
    );
  });

  support.callbackQuery(/^tk:r:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const ticket = await getTicket(db, Number(ctx.match[1]));
    if (ticket?.customerId !== ctx.customer.id) return;
    ctx.session = { step: 'ticket_reply', ticket: { ticketId: ticket.id } };
    await ctx.reply(texts.writeTicket, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text(texts.buttons.cancel, cb.home),
    });
  });

  support.callbackQuery(/^tk:c:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const ticket = await closeTicket(db, {
      ticketId: Number(ctx.match[1]),
      customerId: ctx.customer.id,
    });
    if (!ticket) return;
    ctx.session = {};
    await ctx.editMessageText(texts.ticketClosed(ticket.id), { reply_markup: backHome() });
  });

  // Incoming text / photo / file while writing a ticket.
  support.on(['message:text', 'message:photo', 'message:document'], async (ctx, next) => {
    const { step, ticket: draft } = ctx.session;
    if ((step !== 'ticket_new' && step !== 'ticket_reply') || !draft) return next();
    if (ctx.message.text?.startsWith('/')) return next();

    const photo = ctx.message.photo?.at(-1);
    const message: MessageInput = {
      text: ctx.message.text ?? ctx.message.caption,
      fileId: photo?.file_id ?? ctx.message.document?.file_id,
      fileKind: photo ? 'photo' : ctx.message.document ? 'document' : undefined,
    };
    const home = new InlineKeyboard().text(texts.buttons.home, cb.home);

    if (step === 'ticket_new' && draft.topic) {
      const ticket = await openTicket(db, {
        customerId: ctx.customer.id,
        topic: draft.topic,
        orderId: draft.orderId,
        message,
      });
      ctx.session = {};
      await ctx.reply(texts.ticketOpened(ticket.id), { reply_markup: home });
      await alertAdminsOfTicket(ctx.api, db, ownerIds, ticket, message, true);
    } else if (step === 'ticket_reply' && draft.ticketId) {
      const ticket = await addCustomerMessage(db, {
        ticketId: draft.ticketId,
        customerId: ctx.customer.id,
        message,
      });
      ctx.session = {};
      await ctx.reply(texts.ticketMessageAdded(ticket.id), { reply_markup: home });
      await alertAdminsOfTicket(ctx.api, db, ownerIds, ticket, message, false);
    }
  });

  return support;
}
