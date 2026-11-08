import { bigserial, index, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { variants } from '../catalog/schema.js';

export const stockItemStatus = pgEnum('stock_item_status', ['available', 'sold']);

/** One pre-loaded link or ready account. Payload is encrypted at rest (RULES.md #7). */
export const stockItems = pgTable(
  'stock_items',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    variantId: integer()
      .notNull()
      .references(() => variants.id),
    payloadEncrypted: text().notNull(),
    status: stockItemStatus().notNull().default('available'),
    orderId: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.variantId, table.status)],
);
