import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { recordAudit } from '../audit/index.js';
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
  await db.transaction(async (tx) => {
    const rows = await tx
      .insert(admins)
      .values({ telegramId, addedByTelegramId: addedBy })
      .onConflictDoNothing()
      .returning({ id: admins.id });
    if (rows.length > 0) {
      await recordAudit(tx, {
        adminTelegramId: addedBy,
        action: 'admin.add',
        entityType: 'admin',
        entityId: telegramId,
      });
    }
  });
}

/** Removes an added admin. Owners are not in the table, so they can never be removed. */
export async function removeAdmin(db: Db, telegramId: number, actor: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(admins).where(eq(admins.telegramId, telegramId)).returning();
    if (rows.length === 0) return false;
    await recordAudit(tx, {
      adminTelegramId: actor,
      action: 'admin.remove',
      entityType: 'admin',
      entityId: telegramId,
    });
    return true;
  });
}

export async function listAddedAdmins(db: Db) {
  return db.select().from(admins).orderBy(admins.id);
}

/** Everyone who should receive admin alerts: owners plus added admins. */
export async function listAdminTelegramIds(db: Db, ownerIds: readonly number[]): Promise<number[]> {
  const rows = await db.select({ telegramId: admins.telegramId }).from(admins);
  return [...new Set([...ownerIds, ...rows.map((r) => r.telegramId)])];
}
