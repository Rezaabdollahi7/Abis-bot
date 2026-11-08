import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db.js';
import { registerCustomer } from '../customers/index.js';
import { getBalance } from './index.js';
import { ledgerEntries } from './schema.js';

const getDb = useTestDb();

describe('getBalance', () => {
  it('is zero for a new customer', async () => {
    const customer = await registerCustomer(getDb(), { telegramId: 1, firstName: 'A' });
    expect(await getBalance(getDb(), customer.id)).toBe(0);
  });

  it('sums signed ledger entries of that customer only', async () => {
    const a = await registerCustomer(getDb(), { telegramId: 1, firstName: 'A' });
    const b = await registerCustomer(getDb(), { telegramId: 2, firstName: 'B' });
    await getDb()
      .insert(ledgerEntries)
      .values([
        { customerId: a.id, amountToman: 500_000, kind: 'topup' },
        { customerId: a.id, amountToman: -200_000, kind: 'purchase' },
        { customerId: b.id, amountToman: 999_000, kind: 'topup' },
      ]);
    expect(await getBalance(getDb(), a.id)).toBe(300_000);
  });
});
