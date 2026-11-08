import { boolean, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Runtime settings editable from the admin panel. Private to the settings module. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Destination cards shown to customers for top-ups. At most one is active. */
export const bankCards = pgTable(
  'bank_cards',
  {
    id: serial().primaryKey(),
    number: text().notNull(),
    holderName: text().notNull(),
    bankName: text().notNull(),
    isActive: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // The database itself guarantees a single active card.
  (table) => [
    uniqueIndex('bank_cards_one_active')
      .on(table.isActive)
      .where(sql`${table.isActive}`),
  ],
);
