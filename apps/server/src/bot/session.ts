import { eq } from 'drizzle-orm';
import type { StorageAdapter } from 'grammy';
import type { Db } from '../db/client.js';
import { botSessions } from '../db/infra-schema.js';

/** Where a customer is in a multi-step conversation. Empty = idle. */
export interface SessionData {
  step?: 'phone' | 'amount' | 'receipt';
  /** Chosen top-up amount and the card shown for it, while waiting for the receipt. */
  topupAmount?: number;
  topupCardId?: number;
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
