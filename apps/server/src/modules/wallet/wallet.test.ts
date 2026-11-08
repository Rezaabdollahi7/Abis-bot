import { toman } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db.js';
import { listRecentAudit } from '../audit/index.js';
import { registerCustomer } from '../customers/index.js';
import { addBankCard } from '../settings/index.js';
import { approveTopup, createTopup, getBalance, rejectTopup } from './index.js';
import { ledgerEntries } from './schema.js';

const getDb = useTestDb();
const ADMIN_A = 1;
const ADMIN_B = 2;

async function setup() {
  const customer = await registerCustomer(getDb(), { telegramId: 500, firstName: 'C' });
  const card = await addBankCard(getDb(), ADMIN_A, {
    number: '6037990000000006',
    holderName: 'Owner',
    bankName: 'ملی',
  });
  const newTopup = (uniqueId = 'img-1', amount = 500_000) =>
    createTopup(getDb(), {
      customerId: customer.id,
      amount: toman(amount),
      bankCardId: card.id,
      receiptFileId: `file-${uniqueId}`,
      receiptFileUniqueId: uniqueId,
    });
  return { customer, newTopup };
}

describe('getBalance', () => {
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
    expect(await getBalance(getDb(), 12345)).toBe(0);
  });
});

describe('top-ups', () => {
  it('flags a receipt image that was already used', async () => {
    const { newTopup } = await setup();
    const first = await newTopup('same-image');
    const second = await newTopup('same-image');
    const other = await newTopup('other-image');
    expect(first.duplicateOfTopupId).toBeNull();
    expect(second.duplicateOfTopupId).toBe(first.id);
    expect(other.duplicateOfTopupId).toBeNull();
  });

  it('approves with the claimed amount, credits the wallet and audits', async () => {
    const { customer, newTopup } = await setup();
    const topup = await newTopup();
    const result = await approveTopup(getDb(), { topupId: topup.id, actor: ADMIN_A });
    expect(result.ok).toBe(true);
    expect(await getBalance(getDb(), customer.id)).toBe(500_000);
    expect((await listRecentAudit(getDb(), 1))[0]?.action).toBe('topup.approve');
  });

  it('can approve a corrected amount', async () => {
    const { customer, newTopup } = await setup();
    const topup = await newTopup('img', 500_000);
    await approveTopup(getDb(), { topupId: topup.id, actor: ADMIN_A, amount: toman(450_000) });
    expect(await getBalance(getDb(), customer.id)).toBe(450_000);
  });

  it('credits exactly once when two admins approve at the same moment', async () => {
    const { customer, newTopup } = await setup();
    const topup = await newTopup();
    const results = await Promise.all([
      approveTopup(getDb(), { topupId: topup.id, actor: ADMIN_A }),
      approveTopup(getDb(), { topupId: topup.id, actor: ADMIN_B }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await getBalance(getDb(), customer.id)).toBe(500_000);
    const loser = results.find((r) => !r.ok);
    expect(loser?.topup?.status).toBe('approved');
  });

  it('does not credit when approve races a reject, and the first decision wins', async () => {
    const { customer, newTopup } = await setup();
    const topup = await newTopup();
    const rejected = await rejectTopup(getDb(), {
      topupId: topup.id,
      actor: ADMIN_B,
      reason: 'not found',
    });
    const approved = await approveTopup(getDb(), { topupId: topup.id, actor: ADMIN_A });
    expect(rejected.ok).toBe(true);
    expect(approved).toMatchObject({
      ok: false,
      topup: { status: 'rejected', handledByTelegramId: ADMIN_B },
    });
    expect(await getBalance(getDb(), customer.id)).toBe(0);
  });

  it('reports unknown ids without throwing', async () => {
    expect(await approveTopup(getDb(), { topupId: 999, actor: ADMIN_A })).toEqual({
      ok: false,
      topup: undefined,
    });
  });
});
