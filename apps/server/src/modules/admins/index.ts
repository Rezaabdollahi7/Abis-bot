import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { admins } from './schema.js';

export interface AdminIdentity {
  telegramId: number;
  isOwner: boolean;
}

/** Owners (from env) are always admins; others must be in the admins table. */
export async function resolveAdmin(
  db: Db,
  ownerIds: readonly number[],
  telegramId: number,
): Promise<AdminIdentity | undefined> {
  if (ownerIds.includes(telegramId)) return { telegramId, isOwner: true };
  const [row] = await db.select().from(admins).where(eq(admins.telegramId, telegramId));
  return row ? { telegramId, isOwner: false } : undefined;
}

export async function addAdmin(db: Db, telegramId: number, addedBy: number): Promise<void> {
  await db.insert(admins).values({ telegramId, addedByTelegramId: addedBy }).onConflictDoNothing();
}
