import {
  bigint,
  bigserial,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { customers } from '../customers/schema.js';
import { orders } from '../orders/schema.js';

export const ticketTopic = pgEnum('ticket_topic', ['order', 'payment', 'general']);
export const ticketStatus = pgEnum('ticket_status', [
  'awaiting_admin',
  'awaiting_customer',
  'closed',
]);
export const attachmentKind = pgEnum('attachment_kind', ['photo', 'document']);

export const tickets = pgTable(
  'tickets',
  {
    id: serial().primaryKey(),
    customerId: integer()
      .notNull()
      .references(() => customers.id),
    orderId: integer().references(() => orders.id),
    topic: ticketTopic().notNull(),
    status: ticketStatus().notNull().default('awaiting_admin'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.status, table.updatedAt), index().on(table.customerId)],
);

export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    ticketId: integer()
      .notNull()
      .references(() => tickets.id),
    /** Null when written by the customer. */
    fromAdminTelegramId: bigint({ mode: 'number' }),
    text: text(),
    fileId: text(),
    fileKind: attachmentKind(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.ticketId)],
);
