import type { RequiredFieldName } from '@abis/shared';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const deliveryMethod = pgEnum('delivery_method', [
  'link',
  'ready_account',
  'email_activation',
]);

export const providers = pgTable('providers', {
  id: serial().primaryKey(),
  name: text().notNull(),
  emoji: text().notNull().default('🤖'),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: serial().primaryKey(),
  providerId: integer()
    .notNull()
    .references(() => providers.id),
  name: text().notNull(),
  /** Telegram-HTML description shown on the product card. */
  description: text().notNull().default(''),
  deliveryMethod: deliveryMethod().notNull(),
  /** Inputs asked from the customer for email activation, e.g. ["email", "password"]. */
  requiredFields: jsonb().$type<RequiredFieldName[]>().notNull().default([]),
  warrantyDays: integer().notNull().default(0),
  /** Estimated minutes for manual delivery. */
  etaMinutes: integer(),
  isFeatured: boolean().notNull().default(false),
  isActive: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const variants = pgTable('variants', {
  id: serial().primaryKey(),
  productId: integer()
    .notNull()
    .references(() => products.id),
  durationDays: integer().notNull(),
  priceToman: bigint({ mode: 'number' }).notNull(),
  soldCount: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
