import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db.js';
import { addAdmin, resolveAdmin } from './index.js';

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
