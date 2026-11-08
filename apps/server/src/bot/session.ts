import type { RequiredFieldName } from '@abis/shared';
import { eq } from 'drizzle-orm';
import type { StorageAdapter } from 'grammy';
import type { Db } from '../db/client.js';
import { botSessions } from '../db/infra-schema.js';

/** Where a customer is in a multi-step conversation. Empty = idle. */
export interface SessionData {
  step?:
    | 'phone'
    | 'amount'
    | 'receipt'
    | 'order_input'
    | 'ticket_new'
    | 'ticket_reply'
    | 'admin_deliver'
    | 'admin_input';
  /** Chosen top-up amount and the card shown for it, while waiting for the receipt. */
  topupAmount?: number;
  topupCardId?: number;
  /** A purchase being prepared: collected fields and the one-time confirm key. */
  order?: {
    variantId: number;
    quantity: number;
    values: Partial<Record<RequiredFieldName, string>>;
    key?: string;
  };
  /** A ticket being opened (topic chosen, waiting for the first message) or replied to. */
  ticket?: { topic?: 'order' | 'payment' | 'general'; orderId?: number; ticketId?: number };
  /** Admin: the queued order whose delivery message is being written. */
  adminOrderId?: number;
  /** Admin menu: what the next text message is for. */
  adminInput?: {
    kind: 'search' | 'adjust' | 'dm' | 'broadcast' | 'price' | 'stock' | 'card' | 'setting';
    customerId?: number;
    sign?: 1 | -1;
    variantId?: number;
    settingKey?: 'topupMinToman' | 'topupMaxToman' | 'lowStockThreshold';
    /** Broadcast text waiting for confirmation. */
    text?: string;
  };
}

/** Postgres-backed session storage so a restart never loses a half-finished top-up. */
export function sessionStorage(db: Db): StorageAdapter<SessionData> {
  return {
    async read(key) {
      const [row] = await db.select().from(botSessions).where(eq(botSessions.key, key));
      return row?.value as SessionData | undefined;
    },
    async write(key, value) {
      await db
        .insert(botSessions)
        .values({ key, value })
        .onConflictDoUpdate({ target: botSessions.key, set: { value, updatedAt: new Date() } });
    },
    async delete(key) {
      await db.delete(botSessions).where(eq(botSessions.key, key));
    },
  };
}
