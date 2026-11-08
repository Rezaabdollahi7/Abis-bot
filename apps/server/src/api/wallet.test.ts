import {
  type CustomerProfileDto,
  type CustomerSummaryDto,
  type TopupDto,
  toman,
} from '@abis/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCustomer } from '../modules/customers/index.js';
import { addBankCard } from '../modules/settings/index.js';
import { approveTopup, createTopup, getBalance } from '../modules/wallet/index.js';
import { TEST_OWNER_ID, adminClient } from '../test/api.js';
import { useTestDb } from '../test/db.js';

const getDb = useTestDb();

async function pendingTopup(amount = 500_000) {
  const customer = await registerCustomer(getDb(), {
    telegramId: 777,
    firstName: 'Sara',
    username: 'sara',
  });
  const card = await addBankCard(getDb(), TEST_OWNER_ID, {
    number: '6037990000000006',
    holderName: 'Owner',
    bankName: 'ملی',
  });
  const topup = await createTopup(getDb(), {
    customerId: customer.id,
    amount: toman(amount),
    bankCardId: card.id,
    receiptFileId: 'file',
    receiptFileUniqueId: 'uniq',
  });
  return { customer, topup };
}

describe('top-ups API', () => {
  it('lists pending top-ups with customer and card', async () => {
    await pendingTopup();
    const list = (await (await adminClient(getDb()).get('/topups')).json()) as TopupDto[];
    expect(list[0]).toMatchObject({
      status: 'pending',
      claimedAmountToman: 500_000,
      bankCardLabel: 'ملی ****0006',
      customer: { firstName: 'Sara', username: 'sara' },
    });
  });

  it('approves with a corrected amount and notifies the customer', async () => {
    const { customer, topup } = await pendingTopup();
    const api = adminClient(getDb());
    const res = await api.send('POST', `/topups/${topup.id}/approve`, { amountToman: 450_000 });
    expect(res.status).toBe(200);
    expect(await getBalance(getDb(), customer.id)).toBe(450_000);
    const message = api.telegramCalls.find((c) => c.method === 'sendMessage');
    expect(message?.payload.chat_id).toBe(777);
    expect(String(message?.payload.text)).toContain('اصلاح شد');
  });

  it('rejects with a custom reason, and a second decision is a 409', async () => {
    const { topup } = await pendingTopup();
    const api = adminClient(getDb());
    const res = await api.send('POST', `/topups/${topup.id}/reject`, {
      reason: 'نام واریزکننده مغایر است',
    });
    expect(((await res.json()) as TopupDto).rejectReason).toBe('نام واریزکننده مغایر است');
    const again = await api.send('POST', `/topups/${topup.id}/approve`, {});
    expect(again.status).toBe(409);
  });
});

describe('receipt proxy', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('streams the receipt image from Telegram without exposing the token to the panel', async () => {
    const { topup } = await pendingTopup();
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response('IMG', { headers: { 'Content-Type': 'image/jpeg' } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = adminClient(getDb(), TEST_OWNER_ID, {
      getFile: { file_id: 'file', file_unique_id: 'u', file_path: 'photos/1.jpg' },
    });
    const res = await api.get(`/topups/${topup.id}/receipt`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('IMG');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/file/bot123:secret/photos/1.jpg',
    );
  });
});

describe('customers API', () => {
  it('searches customers and shows balance', async () => {
    const { topup } = await pendingTopup();
    await approveTopup(getDb(), { topupId: topup.id, actor: TEST_OWNER_ID });
    await registerCustomer(getDb(), { telegramId: 888, firstName: 'Ali' });
    const api = adminClient(getDb());
    const found = (await (await api.get('/customers?q=@sar')).json()) as CustomerSummaryDto[];
    expect(found.map((c) => c.firstName)).toEqual(['Sara']);
    expect(found[0]?.balanceToman).toBe(500_000);
    const byId = (await (await api.get('/customers?q=888')).json()) as CustomerSummaryDto[];
    expect(byId.map((c) => c.firstName)).toEqual(['Ali']);
  });

  it('adjusts a wallet, notifies the customer and shows it in the profile ledger', async () => {
    const { customer } = await pendingTopup();
    const api = adminClient(getDb());
    const res = await api.send('POST', `/customers/${customer.id}/adjustments`, {
      amountToman: 200_000,
      reason: 'هدیه‌ی خرید اول',
    });
    expect(res.status).toBe(201);
    expect(api.telegramCalls.some((c) => c.method === 'sendMessage')).toBe(true);
    const profile = (await (
      await api.get(`/customers/${customer.id}`)
    ).json()) as CustomerProfileDto;
    expect(profile.balanceToman).toBe(200_000);
    expect(profile.ledger[0]).toMatchObject({ kind: 'adjustment', reason: 'هدیه‌ی خرید اول' });
  });

  it('refuses a debit larger than the balance', async () => {
    const { customer } = await pendingTopup();
    const res = await adminClient(getDb()).send('POST', `/customers/${customer.id}/adjustments`, {
      amountToman: -1,
      reason: 'test debit',
    });
    expect(res.status).toBe(400);
  });
});

describe('audit API', () => {
  it('lists admin actions with the admin name', async () => {
    const { topup } = await pendingTopup();
    await registerCustomer(getDb(), { telegramId: TEST_OWNER_ID, firstName: 'Reza' });
    await approveTopup(getDb(), { topupId: topup.id, actor: TEST_OWNER_ID });
    const entries = (await (await adminClient(getDb()).get('/audit')).json()) as {
      admin: string;
      action: string;
    }[];
    expect(entries[0]).toMatchObject({ admin: 'Reza', action: 'topup.approve' });
  });
});
