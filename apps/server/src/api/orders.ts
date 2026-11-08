import { type ApiError, type OrderDto, deliverOrderInput, rejectOrderInput } from '@abis/shared';
import type { Api } from 'grammy';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { announceOrderDecision, orderProductLine } from '../bot/order-alerts.js';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import { getVariantWithProduct } from '../modules/catalog/index.js';
import { getCustomersByIds, namesByTelegramId } from '../modules/customers/index.js';
import {
  type Order,
  type OrderDecision,
  deliverOrder,
  listOrders,
  readCustomerInput,
  readDeliveryNote,
  rejectOrder,
} from '../modules/orders/index.js';
import { parseBody } from './body.js';
import type { ApiEnv } from './index.js';

export function orderRoutes(db: Db, telegram: Api, cipher: Cipher): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();
  const actor = (c: Context<ApiEnv>) => c.get('admin').telegramId;
  const id = (c: Context<ApiEnv>) => Number(c.req.param('id'));

  routes.get('/orders', async (c) => {
    const status = z
      .enum(['queued', 'delivered', 'rejected'])
      .catch('queued')
      .parse(c.req.query('status'));
    return c.json(await toOrderDtos(db, cipher, await listOrders(db, status, 100)));
  });

  async function decided(c: Context<ApiEnv>, result: OrderDecision) {
    if (!result.ok) {
      if (!result.order) return c.json<ApiError>({ error: 'not_found' }, 404);
      return c.json<ApiError>({ error: 'conflict', message: 'این سفارش قبلاً بررسی شده است' }, 409);
    }
    await announceOrderDecision(telegram, db, cipher, result.order, result.balance);
    const [dto] = await toOrderDtos(db, cipher, [result.order]);
    return c.json(dto);
  }

  routes.post('/orders/:id{[0-9]+}/deliver', async (c) => {
    const input = await parseBody(c, deliverOrderInput);
    if (!input.ok) return input.response;
    return decided(
      c,
      await deliverOrder(db, cipher, { orderId: id(c), actor: actor(c), note: input.data.note }),
    );
  });

  routes.post('/orders/:id{[0-9]+}/reject', async (c) => {
    const input = await parseBody(c, rejectOrderInput);
    if (!input.ok) return input.response;
    return decided(
      c,
      await rejectOrder(db, { orderId: id(c), actor: actor(c), reason: input.data.reason }),
    );
  });

  return routes;
}

async function toOrderDtos(db: Db, cipher: Cipher, orders: Order[]): Promise<OrderDto[]> {
  const [customers, names] = await Promise.all([
    getCustomersByIds(db, [...new Set(orders.map((o) => o.customerId))]),
    namesByTelegramId(
      db,
      orders.flatMap((o) => (o.handledByTelegramId ? [o.handledByTelegramId] : [])),
    ),
  ]);
  return Promise.all(
    orders.map(async (o) => {
      const customer = customers.get(o.customerId);
      const found = await getVariantWithProduct(db, o.variantId);
      return {
        id: o.id,
        status: o.status,
        productLine: await orderProductLine(db, o),
        deliveryMethod: found?.product.deliveryMethod ?? 'email_activation',
        quantity: o.quantity,
        totalToman: o.totalToman,
        customer: {
          id: o.customerId,
          telegramId: customer?.telegramId ?? 0,
          firstName: customer?.firstName ?? '?',
          username: customer?.username ?? null,
        },
        input: readCustomerInput(cipher, o),
        deliveryNote: readDeliveryNote(cipher, o),
        rejectReason: o.rejectReason,
        handledBy: o.handledByTelegramId
          ? (names.get(o.handledByTelegramId) ?? String(o.handledByTelegramId))
          : null,
        createdAt: o.createdAt.toISOString(),
        deliveredAt: o.deliveredAt?.toISOString() ?? null,
      };
    }),
  );
}
