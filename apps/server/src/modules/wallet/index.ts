import { type Toman, toman } from '@abis/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { ledgerEntries } from './schema.js';

/** Balance = sum of the customer's ledger entries (ADR-0003). */
export async function getBalance(db: Db, customerId: number): Promise<Toman> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amountToman}), 0)`.mapWith(Number) })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.customerId, customerId));
  return toman(row?.total ?? 0);
}
