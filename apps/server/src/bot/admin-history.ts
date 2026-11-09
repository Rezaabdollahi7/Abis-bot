import { toman } from '@abis/shared';
import { Composer, InlineKeyboard } from 'grammy';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import { resolveAdmin } from '../modules/admins/index.js';
import {
  countCustomersSince,
  getCustomer,
  getCustomersByIds,
  namesByTelegramId,
} from '../modules/customers/index.js';
import { recordNotifications } from '../modules/notifications/index.js';
import {
  getOrder,
  listRecentOrders,
  readCustomerInput,
  readDeliveryNote,
  salesSince,
} from '../modules/orders/index.js';
import { getOrderItems } from '../modules/stock/index.js';
import { getTicket, listMessages, listRecentTickets } from '../modules/tickets/index.js';
import { listRecentTopups, topupsSince } from '../modules/wallet/index.js';
import type { BotContext } from './context.js';
import { orderAlertCb, orderProductLine } from './order-alerts.js';
import { adminTexts as t, texts, ticketTopicLabels } from './texts.js';

const HISTORY_LIMIT = 15;
const DAY_MS = 86_400_000;
const ticketStatusLabels = {
  awaiting_admin: '⏳ منتظر پاسخ ما',
  awaiting_customer: '📩 پاسخ داده شده',
  closed: '🔒 بسته',
} as const;

/** «📜 تاریخچه» in /admin: everything, not only what is waiting (orders, top-ups, tickets, stats). */
export function adminHistoryComposer(
  db: Db,
  cipher: Cipher,
  ownerIds: readonly number[],
): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  const isAdmin = async (ctx: BotContext) =>
    ctx.from !== undefined && (await resolveAdmin(db, ownerIds, ctx.from.id)) !== undefined;
  composer
    .callbackQuery(/^ah:/)
    .drop(isAdmin, (ctx) => ctx.answerCallbackQuery({ text: texts.notAdmin, show_alert: true }));
  const admin = composer.filter(isAdmin);

  async function edit(ctx: BotContext, text: string, keyboard: InlineKeyboard) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  admin.callbackQuery('ah:menu', (ctx) =>
    edit(
      ctx,
      t.historyTitle,
      new InlineKeyboard()
        .text(t.buttons.historyOrders, 'ah:orders')
        .text(t.buttons.historyTopups, 'ah:topups')
        .row()
        .text(t.buttons.historyTickets, 'ah:tickets')
        .text(t.buttons.historyStats, 'ah:stats')
        .row()
        .text(t.buttons.back, 'am:home'),
    ),
  );
  const backToMenu = () => new InlineKeyboard().text(texts.buttons.back, 'ah:menu');

  admin.callbackQuery('ah:orders', async (ctx) => {
    const orders = await listRecentOrders(db, HISTORY_LIMIT);
    const customers = await getCustomersByIds(db, [...new Set(orders.map((o) => o.customerId))]);
    const keyboard = new InlineKeyboard();
    for (const o of orders) {
      const name = customers.get(o.customerId)?.firstName ?? '?';
      keyboard
        .text(t.orderLine(o.status, o.id, await orderProductLine(db, o), name), `ah:o:${o.id}`)
        .row();
    }
    await edit(
      ctx,
      orders.length ? t.historyOrdersTitle : t.emptyQueue,
      keyboard.append(backToMenu()),
    );
  });

  admin.callbackQuery(/^ah:o:(\d+)$/, async (ctx) => {
    const order = await getOrder(db, Number(ctx.match[1]));
    if (!order) return ctx.answerCallbackQuery();
    const [customer, items, names] = await Promise.all([
      getCustomer(db, order.customerId),
      order.status === 'delivered' ? getOrderItems(db, cipher, order.id) : Promise.resolve([]),
      namesByTelegramId(db, order.handledByTelegramId ? [order.handledByTelegramId] : []),
    ]);
    const input = readCustomerInput(cipher, order);
    const keyboard = new InlineKeyboard();
    if (order.status === 'queued') {
      keyboard
        .text(texts.buttons.deliver, orderAlertCb.deliver(order.id))
        .text(texts.buttons.rejectRefund, orderAlertCb.rejectMenu(order.id))
        .row();
    }
    if (input.password)
      keyboard.text(texts.buttons.showPassword, orderAlertCb.password(order.id)).row();
    keyboard
      .text(t.buttons.customerCard, `am:c:${order.customerId}`)
      .row()
      .text(texts.buttons.back, 'ah:orders');
    await edit(
      ctx,
      t.adminOrderDetail({
        id: order.id,
        line: await orderProductLine(db, order),
        quantity: order.quantity,
        total: toman(order.totalToman),
        status: order.status,
        customer: customer
          ? `${customer.firstName}${customer.username ? ` (@${customer.username})` : ''}`
          : '?',
        createdAt: order.createdAt,
        email: input.email ?? null,
        note: readDeliveryNote(cipher, order),
        itemsCount: items.length,
        rejectReason: order.rejectReason,
        handledBy: order.handledByTelegramId
          ? (names.get(order.handledByTelegramId) ?? String(order.handledByTelegramId))
          : null,
      }),
      keyboard,
    );
  });

  admin.callbackQuery('ah:topups', async (ctx) => {
    const topups = await listRecentTopups(db, HISTORY_LIMIT);
    const customers = await getCustomersByIds(db, [...new Set(topups.map((x) => x.customerId))]);
    await edit(
      ctx,
      t.topupsHistory(
        topups.map((x) => ({
          id: x.id,
          status: x.status,
          amount: toman(x.approvedAmountToman ?? x.claimedAmountToman),
          name: customers.get(x.customerId)?.firstName ?? '?',
          at: x.createdAt,
        })),
      ),
      backToMenu(),
    );
  });

  admin.callbackQuery('ah:tickets', async (ctx) => {
    const tickets = await listRecentTickets(db, HISTORY_LIMIT);
    const customers = await getCustomersByIds(db, [...new Set(tickets.map((x) => x.customerId))]);
    const keyboard = new InlineKeyboard();
    for (const x of tickets) {
      keyboard
        .text(
          t.ticketLine(x.status, x.id, customers.get(x.customerId)?.firstName ?? '?'),
          `ah:t:${x.id}`,
        )
        .row();
    }
    await edit(
      ctx,
      tickets.length ? t.historyTicketsTitle : t.emptyQueue,
      keyboard.append(backToMenu()),
    );
  });

  // The full thread, sent as a new message that accepts a Reply as the answer.
  admin.callbackQuery(/^ah:t:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const ticket = await getTicket(db, Number(ctx.match[1]));
    if (!ticket) return;
    const [customer, messages] = await Promise.all([
      getCustomer(db, ticket.customerId),
      listMessages(db, ticket.id),
    ]);
    const names = await namesByTelegramId(
      db,
      messages.flatMap((m) => (m.fromAdminTelegramId ? [m.fromAdminTelegramId] : [])),
    );
    const keyboard = new InlineKeyboard();
    if (ticket.status !== 'closed')
      keyboard.text(texts.buttons.closeTicketAdmin, `tk:ac:${ticket.id}`);
    keyboard.text(t.buttons.customerCard, `am:c:${ticket.customerId}`);
    const sent = await ctx.reply(
      t.ticketThread(
        ticket.id,
        ticketTopicLabels[ticket.topic],
        customer?.firstName ?? '?',
        ticketStatusLabels[ticket.status],
        messages.map((m) => ({
          fromAdmin: m.fromAdminTelegramId
            ? (names.get(m.fromAdminTelegramId) ?? String(m.fromAdminTelegramId))
            : null,
          text: m.text,
          hasFile: m.fileId !== null,
          at: m.createdAt,
        })),
      ),
      { parse_mode: 'HTML', reply_markup: keyboard },
    );
    await recordNotifications(db, { type: 'ticket', id: ticket.id }, [
      { chatId: sent.chat.id, messageId: sent.message_id },
    ]);
  });

  admin.callbackQuery('ah:stats', async (ctx) => {
    const now = Date.now();
    const period = async (days: number) => {
      const since = new Date(now - days * DAY_MS);
      const [sales, topups, customers] = await Promise.all([
        salesSince(db, since),
        topupsSince(db, since),
        countCustomersSince(db, since),
      ]);
      return { sales: sales.total, orders: sales.count, topups: topups.total, customers };
    };
    await edit(ctx, t.stats(await period(7), await period(30)), backToMenu());
  });

  return composer;
}
