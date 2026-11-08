import {
  type ApiError,
  type TicketDetailDto,
  type TicketSummaryDto,
  ticketReplyInput,
} from '@abis/shared';
import { type Api, InlineKeyboard } from 'grammy';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { cb } from '../bot/keyboards.js';
import { orderProductLine } from '../bot/order-alerts.js';
import { supportCb } from '../bot/support.js';
import { texts } from '../bot/texts.js';
import type { Db } from '../db/client.js';
import { getCustomer, getCustomersByIds, namesByTelegramId } from '../modules/customers/index.js';
import { getOrder } from '../modules/orders/index.js';
import {
  type Ticket,
  addAdminReply,
  closeTicket,
  getMessage,
  getTicket,
  listMessages,
  listTickets,
} from '../modules/tickets/index.js';
import { parseBody } from './body.js';
import type { ApiEnv } from './index.js';
import { streamTelegramFile } from './telegram-file.js';

export function ticketRoutes(db: Db, telegram: Api, botToken: string): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();
  const id = (c: Context<ApiEnv>) => Number(c.req.param('id'));

  routes.get('/tickets', async (c) => {
    const status = z
      .enum(['awaiting_admin', 'awaiting_customer', 'closed'])
      .catch('awaiting_admin')
      .parse(c.req.query('status'));
    return c.json(await toSummaries(db, await listTickets(db, status, 100)));
  });

  routes.get('/tickets/:id{[0-9]+}', async (c) => {
    const ticket = await getTicket(db, id(c));
    if (!ticket) return c.json<ApiError>({ error: 'not_found' }, 404);
    return c.json(await toDetail(db, ticket));
  });

  routes.post('/tickets/:id{[0-9]+}/reply', async (c) => {
    const input = await parseBody(c, ticketReplyInput);
    if (!input.ok) return input.response;
    const existing = await getTicket(db, id(c));
    if (!existing) return c.json<ApiError>({ error: 'not_found' }, 404);
    const ticket = await addAdminReply(db, {
      ticketId: existing.id,
      actor: c.get('admin').telegramId,
      text: input.data.text,
    });
    const customer = await getCustomer(db, ticket.customerId);
    if (customer) {
      await telegram
        .sendMessage(customer.telegramId, texts.ticketReplyToCustomer(ticket.id, input.data.text), {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text(texts.buttons.replyTicket, supportCb.reply(ticket.id))
            .primary()
            .text(texts.buttons.closeTicket, supportCb.close(ticket.id))
            .row()
            .text(texts.buttons.home, cb.home),
        })
        .catch((error: unknown) => console.error('Could not deliver ticket reply:', error));
    }
    return c.json(await toDetail(db, ticket));
  });

  routes.post('/tickets/:id{[0-9]+}/close', async (c) => {
    const ticket = await closeTicket(db, { ticketId: id(c), actor: c.get('admin').telegramId });
    if (!ticket) return c.json<ApiError>({ error: 'not_found' }, 404);
    return c.json(await toDetail(db, ticket));
  });

  routes.get('/ticket-messages/:id{[0-9]+}/file', async (c) => {
    const message = await getMessage(db, id(c));
    if (!message?.fileId) return c.json<ApiError>({ error: 'not_found' }, 404);
    return streamTelegramFile(c, telegram, botToken, message.fileId);
  });

  return routes;
}

async function toSummaries(db: Db, tickets: Ticket[]): Promise<TicketSummaryDto[]> {
  const customers = await getCustomersByIds(db, [...new Set(tickets.map((t) => t.customerId))]);
  return Promise.all(
    tickets.map(async (t) => {
      const messages = await listMessages(db, t.id);
      const last = messages.at(-1);
      const customer = customers.get(t.customerId);
      return {
        id: t.id,
        topic: t.topic,
        status: t.status,
        orderId: t.orderId,
        customer: {
          id: t.customerId,
          telegramId: customer?.telegramId ?? 0,
          firstName: customer?.firstName ?? '?',
          username: customer?.username ?? null,
        },
        lastMessage: last?.text ?? (last?.fileId ? '📎' : null),
        updatedAt: t.updatedAt.toISOString(),
      };
    }),
  );
}

async function toDetail(db: Db, ticket: Ticket): Promise<TicketDetailDto> {
  const [[summary], messages, order] = await Promise.all([
    toSummaries(db, [ticket]),
    listMessages(db, ticket.id),
    ticket.orderId ? getOrder(db, ticket.orderId) : Promise.resolve(undefined),
  ]);
  if (!summary) throw new Error('toDetail: summary missing');
  const names = await namesByTelegramId(
    db,
    messages.flatMap((m) => (m.fromAdminTelegramId ? [m.fromAdminTelegramId] : [])),
  );
  return {
    ...summary,
    orderLine: order ? await orderProductLine(db, order) : null,
    messages: messages.map((m) => ({
      id: m.id,
      fromAdmin: m.fromAdminTelegramId
        ? (names.get(m.fromAdminTelegramId) ?? String(m.fromAdminTelegramId))
        : null,
      text: m.text,
      fileKind: m.fileKind,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
