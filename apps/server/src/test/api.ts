import { createApi } from '../api/index.js';
import type { Db } from '../db/client.js';
import { signInitData } from '../lib/init-data.js';

export const TEST_BOT_TOKEN = '123:secret';
export const TEST_OWNER_ID = 1;

/** Calls the admin API in-process as the owner (or another Telegram user). */
export function adminClient(db: Db, userId = TEST_OWNER_ID) {
  const api = createApi({
    db,
    config: { BOT_TOKEN: TEST_BOT_TOKEN, OWNER_TELEGRAM_IDS: [TEST_OWNER_ID] },
  });
  const initData = signInitData(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: userId, first_name: 'Reza' }),
    },
    TEST_BOT_TOKEN,
  );
  const headers = { Authorization: `tma ${initData}`, 'Content-Type': 'application/json' };
  return {
    get: (path: string) => api.request(path, { headers }),
    send: (method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown) =>
      api.request(path, { method, headers, body: JSON.stringify(body) }),
  };
}
