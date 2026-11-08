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
import { bankCards } from '../settings/schema.js';

export const ledgerEntryKind = pgEnum('ledger_entry_kind', [
  'topup',
  'purchase',
  'refund',
  'adjustment',
]);

/** Append-only: rows are never updated or deleted (ADR-0003). */
export const ledgerEntries = pgTable('ledger_entries', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  customerId: integer()
    .notNull()
    .references(() => customers.id),
  /** Signed integer Toman: positive adds to the wallet, negative spends. */
  amountToman: bigint({ mode: 'number' }).notNull(),
  kind: ledgerEntryKind().notNull(),
  refType: text(),
  refId: bigint({ mode: 'number' }),
  reason: text(),
  createdByAdminTelegramId: bigint({ mode: 'number' }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const topupStatus = pgEnum('topup_status', ['pending', 'approved', 'rejected']);

/** A customer's card-to-card top-up request, waiting for an admin decision. */
export const topups = pgTable(
  'topups',
  {
    id: serial().primaryKey(),
    customerId: integer()
      .notNull()
      .references(() => customers.id),
    claimedAmountToman: bigint({ mode: 'number' }).notNull(),
    approvedAmountToman: bigint({ mode: 'number' }),
    bankCardId: integer()
      .notNull()
      .references(() => bankCards.id),
    receiptFileId: text().notNull(),
    /** Telegram's stable id for the file; the same image re-sent has the same value. */
    receiptFileUniqueId: text().notNull(),
    duplicateOfTopupId: integer(),
    status: topupStatus().notNull().default('pending'),
    rejectReason: text(),
    handledByTelegramId: bigint({ mode: 'number' }),
    handledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.receiptFileUniqueId), index().on(table.status)],
);
