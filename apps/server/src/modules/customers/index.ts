import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { customers } from './schema.js';

export type Customer = typeof customers.$inferSelect;

export interface TelegramProfile {
  telegramId: number;
  firstName: string;
  lastName?: string | undefined;
  username?: string | undefined;
}

/**
 * Creates the customer on first contact, or refreshes their Telegram profile and last-seen time.
 * Called on every update, so it is a single upsert.
 */
export async function registerCustomer(db: Db, profile: TelegramProfile): Promise<Customer> {
  const values = {
    telegramId: profile.telegramId,
    firstName: profile.firstName,
    lastName: profile.lastName ?? null,
    username: profile.username ?? null,
  };
  const [customer] = await db
    .insert(customers)
    .values(values)
    .onConflictDoUpdate({
      target: customers.telegramId,
      set: { ...values, lastSeenAt: new Date() },
    })
    .returning();
  if (!customer) throw new Error('registerCustomer: upsert returned no row');
  return customer;
}

export async function findCustomerByTelegramId(
  db: Db,
  telegramId: number,
): Promise<Customer | undefined> {
  const [customer] = await db.select().from(customers).where(eq(customers.telegramId, telegramId));
  return customer;
}

export async function setPhone(db: Db, customerId: number, phone: string): Promise<void> {
  await db.update(customers).set({ phone }).where(eq(customers.id, customerId));
}

/** Telegram ids → first names, for showing who handled something. */
export async function namesByTelegramId(db: Db, ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ telegramId: customers.telegramId, firstName: customers.firstName })
    .from(customers)
    .where(inArray(customers.telegramId, ids));
  return new Map(rows.map((r) => [r.telegramId, r.firstName]));
}

export async function getCustomer(db: Db, id: number): Promise<Customer | undefined> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  return customer;
}
