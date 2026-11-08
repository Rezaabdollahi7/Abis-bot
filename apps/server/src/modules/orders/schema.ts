import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { variants } from '../catalog/schema.js';
import { customers } from '../customers/schema.js';

export const orderStatus = pgEnum('order_status', ['queued', 'delivered', 'rejected']);

export const orders = pgTable(
  'orders',
  {
    id: serial().primaryKey(),
    customerId: integer()
      .notNull()
      .references(() => customers.id),
    variantId: integer()
      .notNull()
      .references(() => variants.id),
    quantity: integer().notNull(),
    /** Frozen at purchase time (RULES.md #5). */
    unitPriceToman: bigint({ mode: 'number' }).notNull(),
    totalToman: bigint({ mode: 'number' }).notNull(),
    status: orderStatus().notNull(),
    /** Encrypted JSON of the fields the customer typed (email, password, note). */
    customerInputEncrypted: text(),
    /** When customer-provided input is erased (7 days after delivery). */
    inputPurgeAt: timestamp({ withTimezone: true }),
    /** One purchase per confirm button: a double click cannot buy twice. */
    requestKey: text().notNull(),
    /** What an admin sent the customer on manual delivery (may hold credentials) — encrypted. */
    deliveryNoteEncrypted: text(),
    rejectReason: text(),
    /** Set when a warranty refund was paid; at most one per order. */
    warrantyRefundedAt: timestamp({ withTimezone: true }),
    handledByTelegramId: bigint({ mode: 'number' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp({ withTimezone: true }),
  },
  (table) => [unique().on(table.customerId, table.requestKey), index().on(table.status)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial().primaryKey(),
    orderId: integer()
      .notNull()
      .unique()
      .references(() => orders.id),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    remindedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index().on(table.expiresAt)],
);
