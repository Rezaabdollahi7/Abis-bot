import { describe, expect, it } from 'vitest';
import { signInitData } from '../lib/init-data.js';
import { addAdmin, createLoginToken, removeAdmin } from '../modules/admins/index.js';
import { fakeTelegram } from '../test/api.js';
import { testCipher } from '../test/cipher.js';
import { useTestDb } from '../test/db.js';
import { createApi } from './index.js';

const getDb = useTestDb();
const TOKEN = '123:secret';
const OWNER = 1;

function api() {
  return createApi({
    db: getDb(),
    telegram: fakeTelegram().api,
    cipher: testCipher,
    config: { BOT_TOKEN: TOKEN, OWNER_TELEGRAM_IDS: [OWNER] },
  });
}

function authFor(userId: number, token = TOKEN) {
  const initData = signInitData(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: userId, first_name: 'Reza' }),
    },
    token,
  );
  return { Authorization: `tma ${initData}` };
}

describe('browser session auth', () => {
  it('logs in with a /panel link and uses the session; removed admins lose access', async () => {
    await addAdmin(getDb(), 50, OWNER);
    const token = await createLoginToken(getDb(), 50);
    const exchange = await api().request('/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const { sessionToken } = (await exchange.json()) as { sessionToken: string };
    const headers = { Authorization: `Session ${sessionToken}` };
    expect(await (await api().request('/me', { headers })).json()).toMatchObject({
      telegramId: 50,
    });

    const reused = await api().request('/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    expect(reused.status).toBe(401);

    await removeAdmin(getDb(), 50, OWNER);
    expect((await api().request('/me', { headers })).status).toBe(403);
    expect(
      (await api().request('/me', { headers: { Authorization: 'Session nope' } })).status,
    ).toBe(401);
  });
});

describe('admin API auth', () => {
  it('returns the owner on /me', async () => {
    const res = await api().request('/me', { headers: authFor(OWNER) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ telegramId: OWNER, firstName: 'Reza', isOwner: true });
  });

  it('accepts admins added from the panel', async () => {
    await addAdmin(getDb(), 50, OWNER);
    const res = await api().request('/me', { headers: authFor(50) });
    expect(await res.json()).toMatchObject({ telegramId: 50, isOwner: false });
  });

  it('forbids valid Telegram users who are not admins', async () => {
    const res = await api().request('/me', { headers: authFor(99) });
    expect(res.status).toBe(403);
  });

  it('rejects missing or forged initData', async () => {
    expect((await api().request('/me')).status).toBe(401);
    const forged = await api().request('/me', { headers: authFor(OWNER, '999:other') });
    expect(forged.status).toBe(401);
  });
});
