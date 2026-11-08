import { type ApiError, type StockItemDto, addStockInput } from '@abis/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import { StockError, addStock, listStock, removeStockItem } from '../modules/stock/index.js';
import { parseBody } from './body.js';
import type { ApiEnv } from './index.js';

export function stockRoutes(db: Db, cipher: Cipher): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  routes.get('/variants/:id{[0-9]+}/stock', async (c) =>
    c.json<StockItemDto[]>(await listStock(db, cipher, Number(c.req.param('id')))),
  );

  routes.post('/variants/:id{[0-9]+}/stock', async (c) => {
    const input = await parseBody(c, addStockInput);
    if (!input.ok) return input.response;
    try {
      const added = await addStock(db, cipher, {
        variantId: Number(c.req.param('id')),
        text: input.data.text,
        actor: c.get('admin').telegramId,
      });
      return c.json({ added }, 201);
    } catch (error) {
      if (error instanceof StockError) {
        return c.json<ApiError>({ error: 'invalid_input', message: error.message }, 400);
      }
      throw error;
    }
  });

  routes.delete('/stock/:id{[0-9]+}', async (c) => {
    const removed = await removeStockItem(db, {
      id: Number(c.req.param('id')),
      actor: c.get('admin').telegramId,
    });
    return removed ? c.body(null, 204) : c.json<ApiError>({ error: 'not_found' }, 404);
  });

  return routes;
}
