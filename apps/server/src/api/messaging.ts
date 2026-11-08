import {
  type ApiError,
  type BroadcastDto,
  banInput,
  broadcastInput,
  directMessageInput,
} from '@abis/shared';
import { type Api, GrammyError, InlineKeyboard } from 'grammy';
import { type Context, Hono } from 'hono';
import { sendBroadcast } from '../bot/broadcast.js';
import { cb } from '../bot/keyboards.js';
import { texts } from '../bot/texts.js';
import type { Db } from '../db/client.js';
import { recordAudit } from '../modules/audit/index.js';
import { createBroadcast, listBroadcasts } from '../modules/broadcasts/index.js';
import { getCustomer, setBanned } from '../modules/customers/index.js';
import { parseBody } from './body.js';
import type { ApiEnv } from './index.js';

export function messagingRoutes(db: Db, telegram: Api): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();
  const actor = (c: Context<ApiEnv>) => c.get('admin').telegramId;
  const id = (c: Context<ApiEnv>) => Number(c.req.param('id'));

  routes.post('/customers/:id{[0-9]+}/ban', async (c) => {
    const input = await parseBody(c, banInput);
    if (!input.ok) return input.response;
    const customer = await setBanned(db, {
      customerId: id(c),
      banned: input.data.banned,
      actor: actor(c),
    });
    if (!customer) return c.json<ApiError>({ error: 'not_found' }, 404);
    return c.json({ isBanned: customer.isBanned });
  });

  routes.post('/customers/:id{[0-9]+}/message', async (c) => {
    const input = await parseBody(c, directMessageInput);
    if (!input.ok) return input.response;
    const customer = await getCustomer(db, id(c));
    if (!customer) return c.json<ApiError>({ error: 'not_found' }, 404);
    try {
      await telegram.sendMessage(customer.telegramId, texts.directMessage(input.data.text), {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text(texts.buttons.home, cb.home),
      });
    } catch (error) {
      if (error instanceof GrammyError) {
        return c.json<ApiError>(
          {
            error: 'invalid_input',
            message: 'پیام ارسال نشد؛ احتمالاً کاربر ربات را بلاک کرده است',
          },
          400,
        );
      }
      throw error;
    }
    await recordAudit(db, {
      adminTelegramId: actor(c),
      action: 'customer.message',
      entityType: 'customer',
      entityId: customer.id,
      data: { text: input.data.text },
    });
    return c.json({ ok: true });
  });

  routes.get('/broadcasts', async (c) =>
    c.json<BroadcastDto[]>((await listBroadcasts(db)).map(toDto)),
  );

  routes.post('/broadcasts', async (c) => {
    const input = await parseBody(c, broadcastInput);
    if (!input.ok) return input.response;
    const { broadcast, recipients } = await createBroadcast(db, {
      text: input.data.text,
      actor: actor(c),
    });
    // Sending takes minutes for many customers: run it in the background; the panel polls.
    void sendBroadcast(telegram, db, broadcast, recipients).catch((error: unknown) =>
      console.error(`Broadcast ${broadcast.id} failed:`, error),
    );
    return c.json(toDto(broadcast), 202);
  });

  return routes;
}

function toDto(b: {
  id: number;
  text: string;
  total: number;
  sent: number;
  failed: number;
  status: 'sending' | 'done';
  createdAt: Date;
  finishedAt: Date | null;
}): BroadcastDto {
  return {
    ...b,
    createdAt: b.createdAt.toISOString(),
    finishedAt: b.finishedAt?.toISOString() ?? null,
  };
}
