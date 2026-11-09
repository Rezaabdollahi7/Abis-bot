import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { recordAudit } from '../audit/index.js';
import { ticketMessages, tickets } from './schema.js';

export type Ticket = typeof tickets.$inferSelect;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type TicketTopic = Ticket['topic'];
export type TicketStatus = Ticket['status'];

export interface MessageInput {
  text?: string | undefined;
  fileId?: string | undefined;
  fileKind?: 'photo' | 'document' | undefined;
}

export class TicketError extends Error {}

function hasContent(m: MessageInput): boolean {
  return Boolean(m.text?.trim() || m.fileId);
}

/** A customer opens a ticket with its first message. */
export async function openTicket(
  db: Db,
  input: {
    customerId: number;
    topic: TicketTopic;
    orderId?: number | undefined;
    message: MessageInput;
  },
): Promise<Ticket> {
  if (!hasContent(input.message)) throw new TicketError('empty message');
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(tickets)
      .values({ customerId: input.customerId, topic: input.topic, orderId: input.orderId ?? null })
      .returning();
    if (!ticket) throw new Error('openTicket: insert returned no row');
    await tx
      .insert(ticketMessages)
      .values({ ticketId: ticket.id, ...messageValues(input.message) });
    return ticket;
  });
}

/** The customer writes in their own ticket; a closed ticket reopens. */
export async function addCustomerMessage(
  db: Db,
  input: { ticketId: number; customerId: number; message: MessageInput },
): Promise<Ticket> {
  if (!hasContent(input.message)) throw new TicketError('empty message');
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .update(tickets)
      .set({ status: 'awaiting_admin', updatedAt: new Date() })
      .where(and(eq(tickets.id, input.ticketId), eq(tickets.customerId, input.customerId)))
      .returning();
    if (!ticket) throw new TicketError('ticket not found');
    await tx
      .insert(ticketMessages)
      .values({ ticketId: ticket.id, ...messageValues(input.message) });
    return ticket;
  });
}

/** An admin replies; the ticket now waits for the customer. */
export async function addAdminReply(
  db: Db,
  input: { ticketId: number; actor: number; text: string },
): Promise<Ticket> {
  if (!input.text.trim()) throw new TicketError('empty message');
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .update(tickets)
      .set({ status: 'awaiting_customer', updatedAt: new Date() })
      .where(eq(tickets.id, input.ticketId))
      .returning();
    if (!ticket) throw new TicketError('ticket not found');
    await tx.insert(ticketMessages).values({
      ticketId: ticket.id,
      fromAdminTelegramId: input.actor,
      text: input.text.trim(),
    });
    await recordAudit(tx, {
      adminTelegramId: input.actor,
      action: 'ticket.reply',
      entityType: 'ticket',
      entityId: ticket.id,
    });
    return ticket;
  });
}

/** Closes a ticket. `customerId` restricts it to the owner (bot); admins pass `actor`. */
export async function closeTicket(
  db: Db,
  input: { ticketId: number; customerId?: number; actor?: number },
): Promise<Ticket | undefined> {
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .update(tickets)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(
        input.customerId === undefined
          ? eq(tickets.id, input.ticketId)
          : and(eq(tickets.id, input.ticketId), eq(tickets.customerId, input.customerId)),
      )
      .returning();
    if (ticket && input.actor !== undefined) {
      await recordAudit(tx, {
        adminTelegramId: input.actor,
        action: 'ticket.close',
        entityType: 'ticket',
        entityId: ticket.id,
      });
    }
    return ticket;
  });
}

export async function getTicket(db: Db, id: number): Promise<Ticket | undefined> {
  const [row] = await db.select().from(tickets).where(eq(tickets.id, id));
  return row;
}

export async function listMessages(db: Db, ticketId: number): Promise<TicketMessage[]> {
  return db
    .select()
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.id));
}

export async function getMessage(db: Db, id: number): Promise<TicketMessage | undefined> {
  const [row] = await db.select().from(ticketMessages).where(eq(ticketMessages.id, id));
  return row;
}

/** A customer's tickets, open ones first, most recent activity first. */
export async function listCustomerTickets(
  db: Db,
  customerId: number,
  limit = 10,
): Promise<Ticket[]> {
  return db
    .select()
    .from(tickets)
    .where(and(eq(tickets.customerId, customerId), ne(tickets.status, 'closed')))
    .orderBy(desc(tickets.updatedAt))
    .limit(limit);
}

/** Admin inbox: awaiting admin = oldest first; others = most recent first. */
export async function listTickets(db: Db, status: TicketStatus, limit: number): Promise<Ticket[]> {
  return db
    .select()
    .from(tickets)
    .where(eq(tickets.status, status))
    .orderBy(status === 'awaiting_admin' ? asc(tickets.updatedAt) : desc(tickets.updatedAt))
    .limit(limit);
}

function messageValues(m: MessageInput) {
  return {
    text: m.text?.trim() || null,
    fileId: m.fileId ?? null,
    fileKind: m.fileId ? (m.fileKind ?? 'document') : null,
  };
}

export async function countTicketsAwaitingAdmin(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .where(eq(tickets.status, 'awaiting_admin'));
  return row?.n ?? 0;
}

/** A customer's closed tickets, most recent first. */
export async function listCustomerClosedTickets(
  db: Db,
  customerId: number,
  limit = 10,
): Promise<Ticket[]> {
  return db
    .select()
    .from(tickets)
    .where(and(eq(tickets.customerId, customerId), eq(tickets.status, 'closed')))
    .orderBy(desc(tickets.updatedAt))
    .limit(limit);
}

/** Every ticket regardless of status, most recent activity first (admin history). */
export async function listRecentTickets(db: Db, limit: number): Promise<Ticket[]> {
  return db.select().from(tickets).orderBy(desc(tickets.updatedAt)).limit(limit);
}
