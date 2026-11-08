import { bigint, bigserial, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { customers } from '../customers/schema.js';

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
