import { bigint, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/** Admins added from the panel. Owners come from OWNER_TELEGRAM_IDS and are not stored here. */
export const admins = pgTable('admins', {
  id: serial().primaryKey(),
  telegramId: bigint({ mode: 'number' }).notNull().unique(),
  addedByTelegramId: bigint({ mode: 'number' }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** One-time login links sent by /panel (only a SHA-256 of the token is stored). */
export const panelLoginTokens = pgTable('panel_login_tokens', {
  tokenHash: text().primaryKey(),
  adminTelegramId: bigint({ mode: 'number' }).notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
});

/** Browser sessions of the web panel (only a SHA-256 of the token is stored). */
export const panelSessions = pgTable('panel_sessions', {
  tokenHash: text().primaryKey(),
  adminTelegramId: bigint({ mode: 'number' }).notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
