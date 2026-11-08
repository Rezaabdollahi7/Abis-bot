import { desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Db, Executor } from '../../db/client.js';
import { recordAudit } from '../audit/index.js';
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

/** Row lock on the customer; serialises wallet changes of one customer. False if unknown. */
export async function lockCustomer(exec: Executor, id: number): Promise<boolean> {
  const rows = await exec
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, id))
    .for('update');
  return rows.length > 0;
}

export async function getCustomersByIds(db: Db, ids: number[]): Promise<Map<number, Customer>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(customers).where(inArray(customers.id, ids));
  return new Map(rows.map((c) => [c.id, c]));
}

/** Most recently seen first; `query` matches name, username, phone or Telegram id. */
export async function searchCustomers(db: Db, query: string, limit: number): Promise<Customer[]> {
  const q = query.trim().replace(/^@/, '');
  const pattern = `%${q}%`;
  return db
    .select()
    .from(customers)
    .where(
      q
        ? or(
            ilike(customers.firstName, pattern),
            ilike(customers.lastName, pattern),
            ilike(customers.username, pattern),
            ilike(customers.phone, pattern),
            sql`${customers.telegramId}::text = ${q}`,
          )
        : undefined,
    )
    .orderBy(desc(customers.lastSeenAt))
    .limit(limit);
}

/** Bans or unbans a customer (audited). Their wallet is untouched. */
export async function setBanned(
  db: Db,
  input: { customerId: number; banned: boolean; actor: number },
): Promise<Customer | undefined> {
  return db.transaction(async (tx) => {
    const [customer] = await tx
      .update(customers)
      .set({ isBanned: input.banned })
      .where(eq(customers.id, input.customerId))
      .returning();
    if (customer) {
      await recordAudit(tx, {
        adminTelegramId: input.actor,
        action: input.banned ? 'customer.ban' : 'customer.unban',
        entityType: 'customer',
        entityId: customer.id,
      });
    }
    return customer;
  });
}

/** Telegram ids of everyone a broadcast should reach (not banned). */
export async function listBroadcastRecipients(db: Db): Promise<number[]> {
  const rows = await db
    .select({ telegramId: customers.telegramId })
    .from(customers)
    .where(eq(customers.isBanned, false))
    .orderBy(customers.id);
  return rows.map((r) => r.telegramId);
}

export async function countCustomersSince(db: Db, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(customers)
    .where(gte(customers.createdAt, since));
  return row?.n ?? 0;
}
