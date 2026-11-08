import type { TicketDetailDto, TicketSummaryDto } from '@abis/shared';
import { describe, expect, it } from 'vitest';
import { registerCustomer } from '../modules/customers/index.js';
import { getTicket, openTicket } from '../modules/tickets/index.js';
import { TEST_OWNER_ID, adminClient } from '../test/api.js';
import { useTestDb } from '../test/db.js';

const getDb = useTestDb();

async function ticket() {
  const customer = await registerCustomer(getDb(), { telegramId: 777, firstName: 'Sara' });
  await registerCustomer(getDb(), { telegramId: TEST_OWNER_ID, firstName: 'Reza' });
  return openTicket(getDb(), {
    customerId: customer.id,
    topic: 'payment',
    message: { text: 'شارژم نیومد', fileId: 'f', fileKind: 'photo' },
  });
}

describe('tickets API', () => {
  it('lists tickets waiting for an admin with the last message', async () => {
    await ticket();
    const list = (await (await adminClient(getDb()).get('/tickets')).json()) as TicketSummaryDto[];
    expect(list[0]).toMatchObject({
      topic: 'payment',
      lastMessage: 'شارژم نیومد',
      customer: { firstName: 'Sara' },
    });
  });

  it('replies: the customer gets the message with reply/close buttons and the ticket waits for them', async () => {
    const t = await ticket();
    const api = adminClient(getDb());
    const res = await api.send('POST', `/tickets/${t.id}/reply`, { text: 'بررسی شد، شارژ شد ✅' });
    const detail = (await res.json()) as TicketDetailDto;
    expect(detail.status).toBe('awaiting_customer');
    expect(detail.messages.map((m) => m.fromAdmin)).toEqual([null, 'Reza']);
    const sent = api.telegramCalls.find((c) => c.method === 'sendMessage');
    expect(sent?.payload.chat_id).toBe(777);
    expect(JSON.stringify(sent?.payload.reply_markup)).toContain(`tk:r:${t.id}`);
  });

  it('closes a ticket', async () => {
    const t = await ticket();
    await adminClient(getDb()).send('POST', `/tickets/${t.id}/close`, {});
    expect((await getTicket(getDb(), t.id))?.status).toBe('closed');
  });
});
