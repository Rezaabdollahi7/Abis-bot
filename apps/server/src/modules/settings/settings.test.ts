import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db.js';
import { listRecentAudit } from '../audit/index.js';
import {
  SettingsError,
  addBankCard,
  getActiveBankCard,
  getSettings,
  listBankCards,
  setActiveBankCard,
  updateSetting,
  updateSettings,
} from './index.js';

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

describe('updateSettings', () => {
  it('saves several values with one audit row', async () => {
    const result = await updateSettings(getDb(), 1, {
      requirePhone: false,
      topupMaxToman: 10_000_000,
    });
    expect(result.requirePhone).toBe(false);
    expect((await getSettings(getDb())).topupMaxToman).toBe(10_000_000);
    expect((await listRecentAudit(getDb(), 5)).map((e) => e.action)).toEqual(['settings.update']);
  });

  it('refuses a minimum above the maximum', async () => {
    await expect(
      updateSettings(getDb(), 1, { topupMinToman: 2_000_000, topupMaxToman: 1_000_000 }),
    ).rejects.toThrow(SettingsError);
  });
});

describe('bank cards', () => {
  const card = (n: string) => ({ number: n, holderName: 'رضا عبداللهی', bankName: 'ملت' });

  it('has no active card until one is activated', async () => {
    const added = await addBankCard(getDb(), 1, card('6037990000000006'));
    expect(added.isActive).toBe(false);
    expect(await getActiveBankCard(getDb())).toBeUndefined();
    await setActiveBankCard(getDb(), 1, added.id);
    expect((await getActiveBankCard(getDb()))?.id).toBe(added.id);
  });

  it('keeps exactly one active card when switching', async () => {
    const a = await addBankCard(getDb(), 1, card('6037990000000006'));
    const b = await addBankCard(getDb(), 1, card('6104337000000000'));
    await setActiveBankCard(getDb(), 1, a.id);
    await setActiveBankCard(getDb(), 1, b.id);
    const active = (await listBankCards(getDb())).filter((c) => c.isActive);
    expect(active.map((c) => c.id)).toEqual([b.id]);
  });

  it('can turn top-ups off by deactivating all cards, and rejects unknown ids', async () => {
    const a = await addBankCard(getDb(), 1, card('6037990000000006'));
    await setActiveBankCard(getDb(), 1, a.id);
    await setActiveBankCard(getDb(), 1, null);
    expect(await getActiveBankCard(getDb())).toBeUndefined();
    expect(await setActiveBankCard(getDb(), 1, 999)).toBe(false);
  });
});
