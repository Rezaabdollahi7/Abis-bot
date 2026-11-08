import type { BroadcastDto } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { findCustomerByTelegramId, registerCustomer } from '../modules/customers/index.js';
import { adminClient } from '../test/api.js';
import { useTestDb } from '../test/db.js';

const getDb = useTestDb();

describe('messaging API', () => {
  it('bans and unbans a customer', async () => {
    const c = await registerCustomer(getDb(), { telegramId: 777, firstName: 'Sara' });
    const api = adminClient(getDb());
    expect(
      await (await api.send('POST', `/customers/${c.id}/ban`, { banned: true })).json(),
    ).toEqual({ isBanned: true });
    expect((await findCustomerByTelegramId(getDb(), 777))?.isBanned).toBe(true);
    await api.send('POST', `/customers/${c.id}/ban`, { banned: false });
    expect((await findCustomerByTelegramId(getDb(), 777))?.isBanned).toBe(false);
  });

  it('sends a direct message', async () => {
    const c = await registerCustomer(getDb(), { telegramId: 777, firstName: 'Sara' });
    const api = adminClient(getDb());
    await api.send('POST', `/customers/${c.id}/message`, { text: 'سلام سارا' });
    const sent = api.telegramCalls.find((call) => call.method === 'sendMessage');
    expect(sent?.payload.chat_id).toBe(777);
    expect(String(sent?.payload.text)).toContain('سلام سارا');
  });

  it('starts a broadcast and reports it in the list', async () => {
    await registerCustomer(getDb(), { telegramId: 1, firstName: 'A' });
    const api = adminClient(getDb());
    const res = await api.send('POST', '/broadcasts', { text: 'خبر جدید' });
    expect(res.status).toBe(202);
    expect(((await res.json()) as BroadcastDto).total).toBe(1);
    const list = (await (await api.get('/broadcasts')).json()) as BroadcastDto[];
    expect(list[0]?.text).toBe('خبر جدید');
  });
});
