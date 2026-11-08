import { bigint, integer, pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const broadcastStatus = pgEnum('broadcast_status', ['sending', 'done']);

export const broadcasts = pgTable('broadcasts', {
  id: serial().primaryKey(),
  text: text().notNull(),
  total: integer().notNull(),
  sent: integer().notNull().default(0),
  failed: integer().notNull().default(0),
  status: broadcastStatus().notNull().default('sending'),
  createdByTelegramId: bigint({ mode: 'number' }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp({ withTimezone: true }),
});
