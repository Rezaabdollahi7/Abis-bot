import { bigint, boolean, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const customers = pgTable('customers', {
  id: serial().primaryKey(),
  telegramId: bigint({ mode: 'number' }).notNull().unique(),
  firstName: text().notNull(),
  lastName: text(),
  username: text(),
  phone: text(),
  isBanned: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
