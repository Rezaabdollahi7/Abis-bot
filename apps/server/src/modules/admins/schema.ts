import { bigint, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';

/** Admins added from the panel. Owners come from OWNER_TELEGRAM_IDS and are not stored here. */
export const admins = pgTable('admins', {
  id: serial().primaryKey(),
  telegramId: bigint({ mode: 'number' }).notNull().unique(),
  addedByTelegramId: bigint({ mode: 'number' }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
