import type { StockItemDto } from '@abis/shared';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db, Executor } from '../../db/client.js';
import type { Cipher } from '../../lib/cipher.js';
import { recordAudit } from '../audit/index.js';
import { getVariantWithProduct, usesStock } from '../catalog/index.js';
import { stockItems } from './schema.js';

export class StockError extends Error {}

/** Available stock per variant; variants with no stock are absent (read as 0). */
export async function countAvailable(
  db: Executor,
  variantIds: number[],
): Promise<Map<number, number>> {
  if (variantIds.length === 0) return new Map();
  const rows = await db
    .select({ variantId: stockItems.variantId, available: count() })
    .from(stockItems)
    .where(and(inArray(stockItems.variantId, variantIds), eq(stockItems.status, 'available')))
    .groupBy(stockItems.variantId);
  return new Map(rows.map((row) => [row.variantId, row.available]));
}

/**
 * Splits a bulk paste into items: links one per line; ready accounts are
 * separated by a blank line (so "email\npassword" stays one item).
 */
export function splitBulk(text: string, method: 'link' | 'ready_account'): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  const parts = method === 'link' ? normalized.split('\n') : normalized.split(/\n\s*\n/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Encrypts and stores new stock items for a stock-based variant. Returns how many were added. */
export async function addStock(
  db: Db,
  cipher: Cipher,
  input: { variantId: number; text: string; actor: number },
): Promise<number> {
  const found = await getVariantWithProduct(db, input.variantId);
  if (!found) throw new StockError('این مدت پیدا نشد');
  const method = found.product.deliveryMethod;
  if (method === 'email_activation' || !usesStock(method)) {
    throw new StockError('محصولات فعال‌سازی روی ایمیل انبار ندارند');
  }
  const items = splitBulk(input.text, method);
  if (items.length === 0) throw new StockError('هیچ آیتمی وارد نشده است');

  return db.transaction(async (tx) => {
    await tx.insert(stockItems).values(
      items.map((payload) => ({
        variantId: input.variantId,
        payloadEncrypted: cipher.encrypt(payload),
      })),
    );
    await recordAudit(tx, {
      adminTelegramId: input.actor,
      action: 'stock.add',
      entityType: 'variant',
      entityId: input.variantId,
      data: { count: items.length },
    });
    return items.length;
  });
}

/** Stock of one variant for the panel; payloads are masked, never sent in full. */
export async function listStock(
  db: Db,
  cipher: Cipher,
  variantId: number,
): Promise<StockItemDto[]> {
  const rows = await db
    .select()
    .from(stockItems)
    .where(eq(stockItems.variantId, variantId))
    .orderBy(desc(stockItems.id))
    .limit(500);
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    preview: mask(cipher.decrypt(row.payloadEncrypted)),
    orderId: row.orderId,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Removes an unsold item (e.g. a link pasted by mistake). Sold items are history and stay. */
export async function removeStockItem(
  db: Db,
  input: { id: number; actor: number },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(stockItems)
      .where(and(eq(stockItems.id, input.id), eq(stockItems.status, 'available')))
      .returning({ id: stockItems.id, variantId: stockItems.variantId });
    if (!row) return false;
    await recordAudit(tx, {
      adminTelegramId: input.actor,
      action: 'stock.remove',
      entityType: 'stock_item',
      entityId: row.id,
      data: { variantId: row.variantId },
    });
    return true;
  });
}

/** First line, shortened, with the middle hidden: enough to recognise, not to use. */
export function mask(payload: string): string {
  const line = payload.split('\n')[0] ?? '';
  if (line.length <= 12) return `${line.slice(0, 3)}…`;
  return `${line.slice(0, 8)}…${line.slice(-4)}`;
}
