import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** grammY session storage: per-user conversation step (e.g. waiting for a receipt). */
export const botSessions = pgTable('bot_sessions', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
