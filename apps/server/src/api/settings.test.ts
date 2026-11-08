import type { SettingsResponse } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../test/db.js';
import { adminClient } from '../test/api.js';

const getDb = useTestDb();

describe('settings API', () => {
  it('adds a card from Persian digits, activates it and updates limits', async () => {
    const api = adminClient(getDb());
    const added = await api.send('POST', '/bank-cards', {
      number: '۶۰۳۷-۹۹۰۰-۰۰۰۰-۰۰۰۶',
      holderName: 'رضا عبداللهی',
      bankName: 'ملی',
    });
    expect(added.status).toBe(201);
    const { bankCards } = (await added.json()) as SettingsResponse;
    expect(bankCards[0]?.number).toBe('6037990000000006');

    const activated = (await (
      await api.send('PUT', '/bank-cards/active', { cardId: bankCards[0]?.id })
    ).json()) as SettingsResponse;
    expect(activated.bankCards[0]?.isActive).toBe(true);

    const patched = (await (
      await api.send('PATCH', '/settings', { topupMinToman: 100_000 })
    ).json()) as SettingsResponse;
    expect(patched.settings.topupMinToman).toBe(100_000);
    expect(patched.settings.requirePhone).toBe(true);
  });

  it('rejects an invalid card and inconsistent limits', async () => {
    const api = adminClient(getDb());
    const card = await api.send('POST', '/bank-cards', {
      number: '6037990000000007',
      holderName: 'X Y',
      bankName: 'ملی',
    });
    expect(card.status).toBe(400);
    const limits = await api.send('PATCH', '/settings', { topupMinToman: 99_000_000 });
    expect(limits.status).toBe(400);
  });
});
