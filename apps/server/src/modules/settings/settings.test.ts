import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db.js';
import { getSettings, updateSetting } from './index.js';

const getDb = useTestDb();

describe('settings', () => {
  it('returns defaults when nothing is saved', async () => {
    expect(await getSettings(getDb())).toEqual({
      forcedJoin: false,
      requirePhone: true,
      topupMinToman: 50_000,
      topupMaxToman: 50_000_000,
    });
  });

  it('saves and overwrites a value', async () => {
    await updateSetting(getDb(), 'forcedJoin', true);
    await updateSetting(getDb(), 'topupMinToman', 100_000);
    await updateSetting(getDb(), 'topupMinToman', 200_000);

    const result = await getSettings(getDb());
    expect(result.forcedJoin).toBe(true);
    expect(result.topupMinToman).toBe(200_000);
  });

  it('rejects an invalid value', async () => {
    await expect(updateSetting(getDb(), 'topupMinToman', -5)).rejects.toThrow();
  });
});
