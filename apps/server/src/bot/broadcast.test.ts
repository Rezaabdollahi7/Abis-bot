import { Api, GrammyError } from 'grammy';
import { describe, expect, it } from 'vitest';
import { createBroadcast, listBroadcasts } from '../modules/broadcasts/index.js';
import { registerCustomer, setBanned } from '../modules/customers/index.js';
import { useTestDb } from '../test/db.js';
import { sendBroadcast } from './broadcast.js';

const getDb = useTestDb();

/** Api whose sendMessage fails for chosen chats: 403 (blocked) or one 429 then success. */
function flakyApi(blocked: number[], rateLimitedOnce: number[]) {
  const api = new Api('test');
  const delivered: number[] = [];
  const limited = new Set(rateLimitedOnce);
  api.config.use((_prev, method, payload) => {
    const chatId = (payload as { chat_id: number }).chat_id;
    if (method === 'sendMessage' && blocked.includes(chatId)) {
      throw new GrammyError(
        'blocked',
        { ok: false, error_code: 403, description: 'Forbidden' },
        method,
        payload,
      );
    }
    if (method === 'sendMessage' && limited.delete(chatId)) {
      throw new GrammyError(
        'too many',
        {
          ok: false,
          error_code: 429,
          description: 'Too Many Requests',
          parameters: { retry_after: 3 },
        },
        method,
        payload,
      );
    }
    delivered.push(chatId);
    return Promise.resolve({ ok: true as const, result: { message_id: 1 } as never });
  });
  return { api, delivered };
}

describe('broadcast', () => {
  it('reaches every non-banned customer, retries after a 429 and counts blocked users', async () => {
    for (const id of [11, 12, 13, 14])
      await registerCustomer(getDb(), { telegramId: id, firstName: `U${id}` });
    const banned = await registerCustomer(getDb(), { telegramId: 15, firstName: 'B' });
    await setBanned(getDb(), { customerId: banned.id, banned: true, actor: 1 });

    const { broadcast, recipients } = await createBroadcast(getDb(), {
      text: 'تخفیف ویژه 🎉',
      actor: 1,
    });
    expect(recipients).toEqual([11, 12, 13, 14]);

    const { api, delivered } = flakyApi([12], [13]);
    const waits: number[] = [];
    const result = await sendBroadcast(api, getDb(), broadcast, recipients, {
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

    expect(result).toEqual({ sent: 3, failed: 1 });
    expect(delivered).toEqual([11, 13, 14]);
    expect(waits).toContain(3000);
    const [saved] = await listBroadcasts(getDb());
    expect(saved).toMatchObject({ status: 'done', sent: 3, failed: 1, total: 4 });
  });
});
