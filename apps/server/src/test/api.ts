import { Api } from 'grammy';
import { createApi } from '../api/index.js';
import type { Db } from '../db/client.js';
import { signInitData } from '../lib/init-data.js';
import type { ApiCall } from './bot.js';

export const TEST_BOT_TOKEN = '123:secret';
export const TEST_OWNER_ID = 1;

/** A Bot API client that records calls instead of sending them. */
export function fakeTelegram(responses: Record<string, unknown> = {}) {
  const api = new Api(TEST_BOT_TOKEN);
  const calls: ApiCall[] = [];
  let messageId = 100;
  api.config.use((_prev, method, payload) => {
    const p = payload as Record<string, unknown>;
    calls.push({ method, payload: p });
    const fake = method.startsWith('send')
      ? { message_id: ++messageId, date: 0, chat: { id: p.chat_id, type: 'private' } }
      : true;
    return Promise.resolve({ ok: true as const, result: (responses[method] ?? fake) as never });
  });
  return { api, calls };
}

/** Calls the admin API in-process as the owner (or another Telegram user). */
export function adminClient(
  db: Db,
  userId = TEST_OWNER_ID,
  telegramResponses: Record<string, unknown> = {},
) {
  const telegram = fakeTelegram(telegramResponses);
  const api = createApi({
    db,
    telegram: telegram.api,
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
    telegramCalls: telegram.calls,
    get: (path: string) => api.request(path, { headers }),
    send: (method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown) =>
      api.request(path, { method, headers, body: JSON.stringify(body) }),
  };
}
