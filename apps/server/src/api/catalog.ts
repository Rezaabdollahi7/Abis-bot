import {
  type ApiError,
  type CatalogResponse,
  productInput,
  providerInput,
  variantInput,
} from '@abis/shared';
import { type Context, Hono } from 'hono';
import type { Db } from '../db/client.js';
import { catalogAdmin, getFullCatalog } from '../modules/catalog/index.js';
import { parseBody } from './body.js';
import type { ApiEnv } from './index.js';

/** Catalog management. Rows are deactivated, never deleted (orders will reference them). */
export function catalogRoutes(db: Db): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  routes.get('/catalog', async (c) =>
    c.json<CatalogResponse>({ providers: await getFullCatalog(db) }),
  );

  const actor = (c: Context<ApiEnv>) => c.get('admin').telegramId;
  const id = (c: Context<ApiEnv>) => Number(c.req.param('id'));

  routes.post('/providers', async (c) => {
    const input = await parseBody(c, providerInput);
    if (!input.ok) return input.response;
    return c.json(await catalogAdmin.createProvider(db, actor(c), input.data), 201);
  });
  routes.patch('/providers/:id{[0-9]+}', async (c) => {
    const input = await parseBody(c, providerInput.partial());
    if (!input.ok) return input.response;
    return found(c, await catalogAdmin.updateProvider(db, actor(c), id(c), input.data));
  });

  routes.post('/products', async (c) => {
    const input = await parseBody(c, productInput);
    if (!input.ok) return input.response;
    return c.json(await catalogAdmin.createProduct(db, actor(c), input.data), 201);
  });
  routes.patch('/products/:id{[0-9]+}', async (c) => {
    const input = await parseBody(c, productInput.partial());
    if (!input.ok) return input.response;
    return found(c, await catalogAdmin.updateProduct(db, actor(c), id(c), input.data));
  });

  routes.post('/variants', async (c) => {
    const input = await parseBody(c, variantInput);
    if (!input.ok) return input.response;
    return c.json(await catalogAdmin.createVariant(db, actor(c), input.data), 201);
  });
  routes.patch('/variants/:id{[0-9]+}', async (c) => {
    const input = await parseBody(c, variantInput.partial());
    if (!input.ok) return input.response;
    return found(c, await catalogAdmin.updateVariant(db, actor(c), id(c), input.data));
  });

  return routes;
}

function found(c: Context<ApiEnv>, row: object | undefined) {
  return row ? c.json(row) : c.json<ApiError>({ error: 'not_found' }, 404);
}
