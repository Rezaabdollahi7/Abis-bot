import { bigint, bigserial, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Copies of one alert sent to each admin, so every copy can be updated after one admin acts. */
export const adminNotifications = pgTable(
  'admin_notifications',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    entityType: text().notNull(),
    entityId: integer().notNull(),
    chatId: bigint({ mode: 'number' }).notNull(),
    messageId: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.entityType, table.entityId)],
);
