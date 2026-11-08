import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db.js';
import {
  addAdmin,
  createLoginToken,
  exchangeLoginToken,
  resolveAdmin,
  resolveSessionAdmin,
} from './index.js';

const getDb = useTestDb();
const OWNERS = [1, 2];

describe('resolveAdmin', () => {
  it('treats owners as admins without a table row', async () => {
    expect(await resolveAdmin(getDb(), OWNERS, 1)).toEqual({ telegramId: 1, isOwner: true });
  });

  it('recognises added admins and rejects everyone else', async () => {
    await addAdmin(getDb(), 50, 1);
    expect(await resolveAdmin(getDb(), OWNERS, 50)).toEqual({ telegramId: 50, isOwner: false });
    expect(await resolveAdmin(getDb(), OWNERS, 99)).toBeUndefined();
  });
});

describe('web panel login', () => {
  it('trades a link once for a session that identifies the admin', async () => {
    const token = await createLoginToken(getDb(), 1);
    const first = await exchangeLoginToken(getDb(), token);
    expect(first?.adminTelegramId).toBe(1);
    expect(await exchangeLoginToken(getDb(), token)).toBeUndefined();
    expect(await resolveSessionAdmin(getDb(), first?.sessionToken ?? '')).toBe(1);
  });

  it('rejects expired links and sessions', async () => {
    const issued = new Date('2026-11-08T10:00:00Z');
    const token = await createLoginToken(getDb(), 1, issued);
    expect(
      await exchangeLoginToken(getDb(), token, new Date('2026-11-08T10:11:00Z')),
    ).toBeUndefined();

    const fresh = await createLoginToken(getDb(), 1, issued);
    const session = await exchangeLoginToken(getDb(), fresh, issued);
    expect(
      await resolveSessionAdmin(
        getDb(),
        session?.sessionToken ?? '',
        new Date('2026-11-08T23:00:00Z'),
      ),
    ).toBeUndefined();
  });
});
