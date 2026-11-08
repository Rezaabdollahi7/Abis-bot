import { and, count, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { stockItems } from './schema.js';

/** Available stock per variant; variants with no stock are absent (read as 0). */
export async function countAvailable(db: Db, variantIds: number[]): Promise<Map<number, number>> {
  if (variantIds.length === 0) return new Map();
  const rows = await db
    .select({ variantId: stockItems.variantId, available: count() })
    .from(stockItems)
    .where(and(inArray(stockItems.variantId, variantIds), eq(stockItems.status, 'available')))
    .groupBy(stockItems.variantId);
  return new Map(rows.map((row) => [row.variantId, row.available]));
}
