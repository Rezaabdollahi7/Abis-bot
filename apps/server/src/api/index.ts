import { AUTH_SCHEME, type ApiError, type MeResponse } from '@abis/shared';
import type { Api } from 'grammy';
import { Hono } from 'hono';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import { InitDataError, validateInitData } from '../lib/init-data.js';
import type { Config } from '../lib/config.js';
import { type AdminIdentity, resolveAdmin } from '../modules/admins/index.js';
import { catalogRoutes } from './catalog.js';
import { settingsRoutes } from './settings.js';
import { stockRoutes } from './stock.js';
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

  api.use(async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const [scheme, initData] = header.split(' ', 2);
    if (scheme !== AUTH_SCHEME || !initData) {
      return c.json<ApiError>({ error: 'unauthorized' }, 401);
    }
    try {
      const user = validateInitData(initData, config.BOT_TOKEN, {
        maxAgeSeconds: INIT_DATA_MAX_AGE_SECONDS,
        now: now?.(),
      });
      const admin = await resolveAdmin(db, config.OWNER_TELEGRAM_IDS, user.id);
      if (!admin) return c.json<ApiError>({ error: 'forbidden' }, 403);
      c.set('admin', { ...admin, firstName: user.first_name });
    } catch (error) {
      if (error instanceof InitDataError) {
        return c.json<ApiError>({ error: 'unauthorized', message: error.message }, 401);
      }
      throw error;
    }
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
  api.route('/', walletRoutes(db, telegram, config.BOT_TOKEN));

  return api;
}
