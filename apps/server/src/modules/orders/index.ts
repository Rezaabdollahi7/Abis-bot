import { type RequiredFieldName, type Toman, toman } from '@abis/shared';
import { and, eq } from 'drizzle-orm';
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
import { lockCustomer } from '../customers/index.js';
import { claimStock, countAvailable } from '../stock/index.js';
import { getBalance, recordLedgerEntry } from '../wallet/index.js';
import { orders, subscriptions } from './schema.js';

export type Order = typeof orders.$inferSelect;
export type CustomerInput = Partial<Record<RequiredFieldName, string>>;

/** Most units of a stock-based variant in one order. */
export const MAX_QUANTITY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

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
