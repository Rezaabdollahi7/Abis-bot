import type { RequiredFieldName } from '@abis/shared';
import { eq } from 'drizzle-orm';
import type { StorageAdapter } from 'grammy';
import type { Db } from '../db/client.js';
import { botSessions } from '../db/infra-schema.js';

/** Where a customer is in a multi-step conversation. Empty = idle. */
export interface SessionData {
  step?: 'phone' | 'amount' | 'receipt' | 'order_input';
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
