import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Runtime settings editable from the admin panel. Private to the settings module. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
