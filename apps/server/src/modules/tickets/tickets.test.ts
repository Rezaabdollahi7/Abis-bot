import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db.js';
import { registerCustomer } from '../customers/index.js';
import {
  TicketError,
  addAdminReply,
  addCustomerMessage,
  closeTicket,
  listCustomerTickets,
  listMessages,
  listTickets,
  openTicket,
} from './index.js';

const getDb = useTestDb();

async function customer(telegramId = 1) {
  return registerCustomer(getDb(), { telegramId, firstName: 'C' });
}

describe('tickets', () => {
  it('follows the conversation: customer → admin → customer, with status changes', async () => {
    const c = await customer();
    const ticket = await openTicket(getDb(), {
      customerId: c.id,
      topic: 'general',
      message: { text: 'سلام، سؤال داشتم' },
    });
    expect(ticket.status).toBe('awaiting_admin');
    expect(
      (await addAdminReply(getDb(), { ticketId: ticket.id, actor: 9, text: 'بفرمایید' })).status,
    ).toBe('awaiting_customer');
    const again = await addCustomerMessage(getDb(), {
      ticketId: ticket.id,
      customerId: c.id,
      message: { fileId: 'photo-1', fileKind: 'photo' },
    });
    expect(again.status).toBe('awaiting_admin');
    const messages = await listMessages(getDb(), ticket.id);
    expect(messages.map((m) => [m.fromAdminTelegramId, m.text, m.fileKind])).toEqual([
      [null, 'سلام، سؤال داشتم', null],
      [9, 'بفرمایید', null],
      [null, null, 'photo'],
    ]);
  });

  it('only the owner can write in or close a ticket from the bot', async () => {
    const owner = await customer(1);
    const stranger = await customer(2);
    const ticket = await openTicket(getDb(), {
      customerId: owner.id,
      topic: 'payment',
      message: { text: 'x' },
    });
    await expect(
      addCustomerMessage(getDb(), {
        ticketId: ticket.id,
        customerId: stranger.id,
        message: { text: 'y' },
      }),
    ).rejects.toThrow(TicketError);
    expect(
      await closeTicket(getDb(), { ticketId: ticket.id, customerId: stranger.id }),
    ).toBeUndefined();
  });

  it('closed tickets leave the customer list and reopen on a new message', async () => {
    const c = await customer();
    const ticket = await openTicket(getDb(), {
      customerId: c.id,
      topic: 'general',
      message: { text: 'x' },
    });
    await closeTicket(getDb(), { ticketId: ticket.id, actor: 9 });
    expect(await listCustomerTickets(getDb(), c.id)).toEqual([]);
    expect(await listTickets(getDb(), 'closed', 10)).toHaveLength(1);
    await addCustomerMessage(getDb(), {
      ticketId: ticket.id,
      customerId: c.id,
      message: { text: 'again' },
    });
    expect((await listTickets(getDb(), 'awaiting_admin', 10)).map((t) => t.id)).toEqual([
      ticket.id,
    ]);
  });

  it('refuses empty messages', async () => {
    const c = await customer();
    await expect(
      openTicket(getDb(), { customerId: c.id, topic: 'general', message: { text: '  ' } }),
    ).rejects.toThrow(TicketError);
  });
});
