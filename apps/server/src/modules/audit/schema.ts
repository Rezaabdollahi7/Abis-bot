import { bigint, bigserial, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Every admin action: who, what, when (RULES.md #4). Append-only. */
export const auditLog = pgTable('audit_log', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  adminTelegramId: bigint({ mode: 'number' }).notNull(),
  action: text().notNull(),
  entityType: text().notNull(),
  entityId: bigint({ mode: 'number' }).notNull(),
  data: jsonb().notNull().default({}),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
