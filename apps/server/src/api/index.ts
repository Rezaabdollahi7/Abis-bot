import {
  AUTH_SCHEME,
  SESSION_SCHEME,
  type ApiError,
  type LoginExchangeResponse,
  type MeResponse,
} from '@abis/shared';
import type { Api } from 'grammy';
import { Hono } from 'hono';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import { InitDataError, validateInitData } from '../lib/init-data.js';
import type { Config } from '../lib/config.js';
import {
  type AdminIdentity,
  exchangeLoginToken,
  resolveAdmin,
  resolveSessionAdmin,
} from '../modules/admins/index.js';
import { namesByTelegramId } from '../modules/customers/index.js';
import { catalogRoutes } from './catalog.js';
import { dashboardRoutes } from './dashboard.js';
import { messagingRoutes } from './messaging.js';
import { orderRoutes } from './orders.js';
import { settingsRoutes } from './settings.js';
import { stockRoutes } from './stock.js';
import { ticketRoutes } from './tickets.js';
import { walletRoutes } from './wallet.js';

export interface ApiDeps {
  db: Db;
  /** Bot API client, for notifying customers and fetching receipt images. */
  telegram: Api;
  cipher: Cipher;
  config: Pick<Config, 'BOT_TOKEN' | 'OWNER_TELEGRAM_IDS'>;
  now?: (() => Date) | undefined;
}

export interface ApiEnv {
  Variables: { admin: AdminIdentity & { firstName: string } };
}

const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

/** Admin API for the Mini App, mounted under /api. Every route requires an admin. */
export function createApi({ db, telegram, cipher, config, now }: ApiDeps): Hono<ApiEnv> {
  const api = new Hono<ApiEnv>();

  // Login link exchange: the only route that needs no prior authentication.
  api.post('/auth/exchange', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { token?: unknown };
    const result =
      typeof body.token === 'string'
        ? await exchangeLoginToken(db, body.token, now?.())
        : undefined;
    if (!result)
      return c.json<ApiError>({ error: 'unauthorized', message: 'invalid or used link' }, 401);
    return c.json<LoginExchangeResponse>({ sessionToken: result.sessionToken });
  });

  api.use(async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const [scheme, credential] = header.split(' ', 2);
    if (!credential) return c.json<ApiError>({ error: 'unauthorized' }, 401);

    let telegramId: number;
    let firstName: string;
    if (scheme === AUTH_SCHEME) {
      try {
        const user = validateInitData(credential, config.BOT_TOKEN, {
          maxAgeSeconds: INIT_DATA_MAX_AGE_SECONDS,
          now: now?.(),
        });
        telegramId = user.id;
        firstName = user.first_name;
      } catch (error) {
        if (error instanceof InitDataError) {
          return c.json<ApiError>({ error: 'unauthorized', message: error.message }, 401);
        }
        throw error;
      }
    } else if (scheme === SESSION_SCHEME) {
      const id = await resolveSessionAdmin(db, credential, now?.());
      if (id === undefined)
        return c.json<ApiError>({ error: 'unauthorized', message: 'session expired' }, 401);
      telegramId = id;
      firstName = (await namesByTelegramId(db, [id])).get(id) ?? '';
    } else {
      return c.json<ApiError>({ error: 'unauthorized' }, 401);
    }

    // Admin status is checked on every request, so removing an admin ends their sessions too.
    const admin = await resolveAdmin(db, config.OWNER_TELEGRAM_IDS, telegramId);
    if (!admin) return c.json<ApiError>({ error: 'forbidden' }, 403);
    c.set('admin', { ...admin, firstName });
    await next();
  });

  api.get('/me', (c) => {
    const admin = c.get('admin');
    return c.json<MeResponse>({
      telegramId: admin.telegramId,
      firstName: admin.firstName,
      isOwner: admin.isOwner,
    });
  });

  api.route('/', catalogRoutes(db));
  api.route('/', settingsRoutes(db));
  api.route('/', stockRoutes(db, cipher));
  api.route('/', orderRoutes(db, telegram, cipher));
  api.route('/', ticketRoutes(db, telegram, config.BOT_TOKEN));
  api.route('/', messagingRoutes(db, telegram));
  api.route('/', dashboardRoutes(db, config.OWNER_TELEGRAM_IDS));
  api.route('/', walletRoutes(db, telegram, config.BOT_TOKEN));

  return api;
}
