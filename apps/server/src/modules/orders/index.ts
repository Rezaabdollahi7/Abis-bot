import { type RequiredFieldName, type Toman, toman } from '@abis/shared';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { Cipher } from '../../lib/cipher.js';
import {
  type Product,
  type Provider,
  type Variant,
  addSold,
  getVariantWithProduct,
  isOnSale,
  usesStock,
} from '../catalog/index.js';
import { recordAudit } from '../audit/index.js';
import { lockCustomer } from '../customers/index.js';
import { claimStock, countAvailable } from '../stock/index.js';
import { getBalance, recordLedgerEntry } from '../wallet/index.js';
import { orders, pendingPurchases, subscriptions } from './schema.js';

export type Order = typeof orders.$inferSelect;
export type CustomerInput = Partial<Record<RequiredFieldName, string>>;

/** Most units of a stock-based variant in one order. */
export const MAX_QUANTITY = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Customer-provided input (passwords) is erased this long after delivery. */
export const INPUT_RETENTION_DAYS = 7;

export type PurchaseFailure =
  | { reason: 'not_on_sale' }
  | { reason: 'invalid_quantity' }
  | { reason: 'invalid_input'; field: RequiredFieldName }
  | { reason: 'insufficient_balance'; shortfall: Toman; balance: Toman }
  /** Stock exists but less than requested; the customer can buy fewer. */
  | { reason: 'not_enough_stock'; available: number }
  /** The same confirm button was already used. */
  | { reason: 'duplicate'; orderId: number };

export type PurchaseResult =
  | {
      ok: true;
      order: Order;
      /** Delivered payloads for stock-based orders; empty when queued for manual delivery. */
      items: string[];
      balance: Toman;
      variant: Variant;
      product: Product;
      provider: Provider;
      /** Stock left after this sale, for the low-stock alert (null for email activation). */
      stockLeft: number | null;
    }
  | ({ ok: false } & PurchaseFailure);

class Abort extends Error {
  constructor(readonly failure: PurchaseFailure) {
    super(failure.reason);
  }
}

const emailSchema = z.email();

/** Checks the customer-provided fields a product requires; returns the first bad field. */
export function validateInput(
  fields: readonly RequiredFieldName[],
  input: CustomerInput,
): RequiredFieldName | undefined {
  for (const field of fields) {
    const value = input[field]?.trim() ?? '';
    if (!value) return field;
    if (field === 'email' && !emailSchema.safeParse(value).success) return field;
  }
  return undefined;
}

/**
 * Buys a variant from the wallet in one transaction: lock the customer, check the
 * balance, claim stock (or queue for manual delivery), write the order, the negative
 * ledger entry and the subscription. Either everything happens or nothing does.
 */
export async function purchase(
  db: Db,
  cipher: Cipher,
  input: {
    customerId: number;
    variantId: number;
    quantity: number;
    customerInput?: CustomerInput | undefined;
    requestKey: string;
  },
): Promise<PurchaseResult> {
  try {
    return await db.transaction(async (tx) => {
      await lockCustomer(tx, input.customerId);

      const [existing] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(eq(orders.customerId, input.customerId), eq(orders.requestKey, input.requestKey)),
        );
      if (existing) {
        throw new Abort({ reason: 'duplicate', orderId: existing.id });
      }

      const found = await getVariantWithProduct(tx, input.variantId);
      if (!found || !isOnSale(found)) throw new Abort({ reason: 'not_on_sale' });
      const { variant, product, provider } = found;
      const stockBased = usesStock(product.deliveryMethod);

      const maxQuantity = stockBased ? MAX_QUANTITY : 1;
      if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > maxQuantity) {
        throw new Abort({ reason: 'invalid_quantity' });
      }
      const customerInput = input.customerInput ?? {};
      if (!stockBased) {
        const bad = validateInput(product.requiredFields, customerInput);
        if (bad) throw new Abort({ reason: 'invalid_input', field: bad });
      }

      const total = toman(variant.priceToman * input.quantity);
      const balance = await getBalance(tx, input.customerId);
      if (balance < total) {
        throw new Abort({
          reason: 'insufficient_balance',
          shortfall: toman(total - balance),
          balance,
        });
      }

      const [order] = await tx
        .insert(orders)
        .values({
          customerId: input.customerId,
          variantId: variant.id,
          quantity: input.quantity,
          unitPriceToman: variant.priceToman,
          totalToman: total,
          status: 'queued',
          customerInputEncrypted: stockBased
            ? null
            : cipher.encrypt(JSON.stringify(pickFields(product.requiredFields, customerInput))),
          requestKey: input.requestKey,
        })
        .returning();
      if (!order) throw new Error('purchase: insert returned no row');

      let items: string[] = [];
      let delivered = order;
      if (stockBased) {
        items = await claimStock(tx, cipher, {
          variantId: variant.id,
          quantity: input.quantity,
          orderId: order.id,
        });
        if (items.length > 0 && items.length < input.quantity) {
          throw new Abort({ reason: 'not_enough_stock', available: items.length });
        }
        if (items.length === input.quantity) {
          const now = new Date();
          const [updated] = await tx
            .update(orders)
            .set({ status: 'delivered', deliveredAt: now })
            .where(eq(orders.id, order.id))
            .returning();
          if (updated) delivered = updated;
          await tx.insert(subscriptions).values({
            orderId: order.id,
            startsAt: now,
            expiresAt: new Date(now.getTime() + variant.durationDays * DAY_MS),
          });
        }
      }

      await recordLedgerEntry(tx, {
        customerId: input.customerId,
        amount: toman(-total),
        kind: 'purchase',
        refType: 'order',
        refId: order.id,
      });
      await addSold(tx, variant.id, input.quantity);

      const stockLeft = stockBased
        ? ((await countAvailable(tx, [variant.id])).get(variant.id) ?? 0)
        : null;
      return {
        ok: true as const,
        order: delivered,
        items,
        balance: toman(balance - total),
        variant,
        product,
        provider,
        stockLeft,
      };
    });
  } catch (error) {
    if (error instanceof Abort) return { ok: false, ...error.failure };
    throw error;
  }
}

function pickFields(fields: readonly RequiredFieldName[], input: CustomerInput): CustomerInput {
  return Object.fromEntries(fields.map((f) => [f, input[f]?.trim() ?? '']));
}

export async function getOrder(db: Db, id: number): Promise<Order | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row;
}

/** Customer-provided fields of an order; empty once purged. */
export function readCustomerInput(cipher: Cipher, order: Order): CustomerInput {
  if (!order.customerInputEncrypted) return {};
  return JSON.parse(cipher.decrypt(order.customerInputEncrypted)) as CustomerInput;
}

export type OrderStatus = Order['status'];
export type Subscription = typeof subscriptions.$inferSelect;

/** Queued: oldest first (work queue). Decided: newest first (history). */
export async function listOrders(db: Db, status: OrderStatus, limit: number): Promise<Order[]> {
  return db
    .select()
    .from(orders)
    .where(eq(orders.status, status))
    .orderBy(status === 'queued' ? asc(orders.id) : desc(orders.id))
    .limit(limit);
}

export type OrderDecision =
  | { ok: true; order: Order; balance?: Toman }
  /** Already delivered/rejected by someone else, or unknown id. */
  | { ok: false; order: Order | undefined };

/**
 * Marks a queued order delivered exactly once, stores what the admin sent
 * (encrypted), starts the subscription and schedules the input purge.
 */
export async function deliverOrder(
  db: Db,
  cipher: Cipher,
  input: { orderId: number; actor: number; note: string },
): Promise<OrderDecision> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [order] = await tx
      .update(orders)
      .set({
        status: 'delivered',
        deliveredAt: now,
        handledByTelegramId: input.actor,
        deliveryNoteEncrypted: cipher.encrypt(input.note),
        inputPurgeAt: new Date(now.getTime() + INPUT_RETENTION_DAYS * DAY_MS),
      })
      .where(and(eq(orders.id, input.orderId), eq(orders.status, 'queued')))
      .returning();
    if (!order) return { ok: false, order: await reloadOrder(tx, input.orderId) };

    const found = await getVariantWithProduct(tx, order.variantId);
    const days = found?.variant.durationDays ?? 0;
    await tx.insert(subscriptions).values({
      orderId: order.id,
      startsAt: now,
      expiresAt: new Date(now.getTime() + days * DAY_MS),
    });
    await recordAudit(tx, {
      adminTelegramId: input.actor,
      action: 'order.deliver',
      entityType: 'order',
      entityId: order.id,
    });
    return { ok: true, order };
  });
}

/** Rejects a queued order exactly once and refunds the full amount to the wallet. */
export async function rejectOrder(
  db: Db,
  input: { orderId: number; actor: number; reason: string },
): Promise<OrderDecision> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .update(orders)
      .set({ status: 'rejected', rejectReason: input.reason, handledByTelegramId: input.actor })
      .where(and(eq(orders.id, input.orderId), eq(orders.status, 'queued')))
      .returning();
    if (!order) return { ok: false, order: await reloadOrder(tx, input.orderId) };

    await recordLedgerEntry(tx, {
      customerId: order.customerId,
      amount: toman(order.totalToman),
      kind: 'refund',
      refType: 'order',
      refId: order.id,
      reason: input.reason,
      createdByAdminTelegramId: input.actor,
    });
    await recordAudit(tx, {
      adminTelegramId: input.actor,
      action: 'order.reject',
      entityType: 'order',
      entityId: order.id,
      data: { reason: input.reason, refund: order.totalToman },
    });
    return { ok: true, order, balance: await getBalance(tx, order.customerId) };
  });
}

async function reloadOrder(exec: Parameters<typeof getVariantWithProduct>[0], id: number) {
  const [row] = await exec.select().from(orders).where(eq(orders.id, id));
  return row;
}

export function readDeliveryNote(cipher: Cipher, order: Order): string | null {
  return order.deliveryNoteEncrypted ? cipher.decrypt(order.deliveryNoteEncrypted) : null;
}

/** A customer's subscriptions that have not expired yet, soonest expiry first. */
export async function listActiveSubscriptions(
  db: Db,
  customerId: number,
  now = new Date(),
): Promise<{ order: Order; subscription: Subscription }[]> {
  return db
    .select({ order: orders, subscription: subscriptions })
    .from(subscriptions)
    .innerJoin(orders, eq(subscriptions.orderId, orders.id))
    .where(and(eq(orders.customerId, customerId), gt(subscriptions.expiresAt, now)))
    .orderBy(asc(subscriptions.expiresAt));
}

export const REMINDER_DAYS_BEFORE = 3;

/**
 * Marks every subscription expiring within the reminder window as reminded and
 * returns them. Marking first (one UPDATE … RETURNING) means a reminder is sent
 * at most once, even if two job runs overlap.
 */
export async function claimDueReminders(
  db: Db,
  now = new Date(),
): Promise<{ subscription: Subscription; order: Order }[]> {
  const windowEnd = new Date(now.getTime() + REMINDER_DAYS_BEFORE * DAY_MS);
  const claimed = await db
    .update(subscriptions)
    .set({ remindedAt: now })
    .where(
      and(
        isNull(subscriptions.remindedAt),
        gt(subscriptions.expiresAt, now),
        lte(subscriptions.expiresAt, windowEnd),
      ),
    )
    .returning();
  if (claimed.length === 0) return [];
  const rows = await db
    .select()
    .from(orders)
    .where(
      inArray(
        orders.id,
        claimed.map((s) => s.orderId),
      ),
    );
  const byId = new Map(rows.map((o) => [o.id, o]));
  return claimed.flatMap((subscription) => {
    const order = byId.get(subscription.orderId);
    return order ? [{ subscription, order }] : [];
  });
}

/** Erases customer-provided input (passwords) whose retention has ended. Returns the count. */
export async function purgeExpiredInput(db: Db, now = new Date()): Promise<number> {
  const rows = await db
    .update(orders)
    .set({ customerInputEncrypted: null })
    .where(and(isNotNull(orders.customerInputEncrypted), lte(orders.inputPurgeAt, now)))
    .returning({ id: orders.id });
  return rows.length;
}

/** A customer's latest orders (for linking a support ticket to one). */
export async function listCustomerOrders(db: Db, customerId: number, limit = 8): Promise<Order[]> {
  return db
    .select()
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.id))
    .limit(limit);
}

export interface WarrantyInfo {
  /** Delivery + the product's warranty days; null if not delivered. */
  warrantyEndsAt: Date | null;
  underWarranty: boolean;
  /** Unused share of the price: total × remaining subscription days ÷ duration. */
  suggestedRefund: Toman;
  alreadyRefunded: boolean;
}

export async function getWarrantyInfo(
  db: Db,
  order: Order,
  now = new Date(),
): Promise<WarrantyInfo> {
  const found = await getVariantWithProduct(db, order.variantId);
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.orderId, order.id));
  const delivered = order.status === 'delivered' && order.deliveredAt;
  const warrantyEndsAt =
    delivered && found
      ? new Date((order.deliveredAt?.getTime() ?? 0) + found.product.warrantyDays * DAY_MS)
      : null;
  const durationDays = found?.variant.durationDays ?? 0;
  const remainingDays = subscription
    ? Math.max(0, Math.floor((subscription.expiresAt.getTime() - now.getTime()) / DAY_MS))
    : 0;
  const suggested =
    durationDays > 0
      ? Math.floor((order.totalToman * Math.min(remainingDays, durationDays)) / durationDays)
      : 0;
  return {
    warrantyEndsAt,
    underWarranty: warrantyEndsAt !== null && warrantyEndsAt > now,
    suggestedRefund: toman(suggested),
    alreadyRefunded: order.warrantyRefundedAt !== null,
  };
}

export class WarrantyError extends Error {}

/**
 * Pays a warranty refund once per delivered order (guarded on warranty_refunded_at),
 * ends the subscription now so no renewal reminder follows, and audits it.
 * The amount is the admin's call (usually the suggested prorated amount), capped at the order total.
 */
export async function refundWarranty(
  db: Db,
  input: { orderId: number; actor: number; amount: Toman; reason: string },
): Promise<{ order: Order; balance: Toman }> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, input.orderId));
    if (!current) throw new WarrantyError('سفارش پیدا نشد');
    if (input.amount <= 0 || input.amount > current.totalToman) {
      throw new WarrantyError('مبلغ بازپرداخت باید بین ۱ و مبلغ سفارش باشد');
    }
    const now = new Date();
    const [order] = await tx
      .update(orders)
      .set({ warrantyRefundedAt: now })
      .where(
        and(
          eq(orders.id, input.orderId),
          eq(orders.status, 'delivered'),
          isNull(orders.warrantyRefundedAt),
        ),
      )
      .returning();
    if (!order) throw new WarrantyError('این سفارش تحویل‌نشده است یا قبلاً بازپرداخت گارانتی شده');

    await tx
      .update(subscriptions)
      .set({ expiresAt: now })
      .where(eq(subscriptions.orderId, order.id));
    await recordLedgerEntry(tx, {
      customerId: order.customerId,
      amount: input.amount,
      kind: 'refund',
      refType: 'warranty',
      refId: order.id,
      reason: input.reason,
      createdByAdminTelegramId: input.actor,
    });
    await recordAudit(tx, {
      adminTelegramId: input.actor,
      action: 'order.warranty_refund',
      entityType: 'order',
      entityId: order.id,
      data: { amount: input.amount, reason: input.reason },
    });
    return { order, balance: await getBalance(tx, order.customerId) };
  });
}

/** Orders placed since `since` that were not rejected: count and gross Toman. */
export async function salesSince(db: Db, since: Date): Promise<{ count: number; total: Toman }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      total: sql<number>`coalesce(sum(${orders.totalToman}), 0)`.mapWith(Number),
    })
    .from(orders)
    .where(and(gte(orders.createdAt, since), ne(orders.status, 'rejected')));
  return { count: row?.count ?? 0, total: toman(row?.total ?? 0) };
}

export async function countQueuedOrders(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(orders)
    .where(eq(orders.status, 'queued'));
  return row?.n ?? 0;
}

// ── Pending purchase: continue after a top-up ──────────────────────────────────

export interface PendingPurchase {
  variantId: number;
  quantity: number;
  input: CustomerInput;
}

export async function savePendingPurchase(
  db: Db,
  cipher: Cipher,
  customerId: number,
  pending: PendingPurchase,
): Promise<void> {
  const values = {
    variantId: pending.variantId,
    quantity: pending.quantity,
    inputEncrypted:
      Object.keys(pending.input).length > 0 ? cipher.encrypt(JSON.stringify(pending.input)) : null,
    createdAt: new Date(),
  };
  await db
    .insert(pendingPurchases)
    .values({ customerId, ...values })
    .onConflictDoUpdate({ target: pendingPurchases.customerId, set: values });
}

export async function getPendingPurchase(
  db: Db,
  cipher: Cipher,
  customerId: number,
): Promise<PendingPurchase | undefined> {
  const [row] = await db
    .select()
    .from(pendingPurchases)
    .where(eq(pendingPurchases.customerId, customerId));
  if (!row) return undefined;
  return {
    variantId: row.variantId,
    quantity: row.quantity,
    input: row.inputEncrypted
      ? (JSON.parse(cipher.decrypt(row.inputEncrypted)) as CustomerInput)
      : {},
  };
}

/** The variant a customer was about to buy before topping up, if any. */
export async function pendingPurchaseVariant(
  db: Db,
  customerId: number,
): Promise<number | undefined> {
  const [row] = await db
    .select({ variantId: pendingPurchases.variantId })
    .from(pendingPurchases)
    .where(eq(pendingPurchases.customerId, customerId));
  return row?.variantId;
}

export async function clearPendingPurchase(db: Db, customerId: number): Promise<void> {
  await db.delete(pendingPurchases).where(eq(pendingPurchases.customerId, customerId));
}

/** One of the customer's own orders (undefined for someone else's). */
export async function getCustomerOrder(
  db: Db,
  customerId: number,
  orderId: number,
): Promise<{ order: Order; subscription: Subscription | undefined } | undefined> {
  const [row] = await db
    .select({ order: orders, subscription: subscriptions })
    .from(orders)
    .leftJoin(subscriptions, eq(subscriptions.orderId, orders.id))
    .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)));
  return row ? { order: row.order, subscription: row.subscription ?? undefined } : undefined;
}

/** Every order regardless of status, newest first (admin history). */
export async function listRecentOrders(db: Db, limit: number): Promise<Order[]> {
  return db.select().from(orders).orderBy(desc(orders.id)).limit(limit);
}
