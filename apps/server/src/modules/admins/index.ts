import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { recordAudit } from '../audit/index.js';
import { admins, panelLoginTokens, panelSessions } from './schema.js';

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

// ── Web panel login (ADR-0005): one-time link → browser session ─────────────

const LOGIN_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

/** Creates a single-use login token for an admin, valid for 10 minutes. */
export async function createLoginToken(
  db: Db,
  adminTelegramId: number,
  now = new Date(),
): Promise<string> {
  const token = newToken();
  await db.insert(panelLoginTokens).values({
    tokenHash: hash(token),
    adminTelegramId,
    expiresAt: new Date(now.getTime() + LOGIN_TTL_MS),
  });
  return token;
}

/**
 * Trades a login token for a 12-hour session token, exactly once (guarded UPDATE).
 * Returns undefined for unknown, used or expired tokens.
 */
export async function exchangeLoginToken(
  db: Db,
  token: string,
  now = new Date(),
): Promise<{ sessionToken: string; adminTelegramId: number } | undefined> {
  return db.transaction(async (tx) => {
    const [login] = await tx
      .update(panelLoginTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(panelLoginTokens.tokenHash, hash(token)),
          isNull(panelLoginTokens.usedAt),
          gt(panelLoginTokens.expiresAt, now),
        ),
      )
      .returning();
    if (!login) return undefined;
    const sessionToken = newToken();
    await tx.insert(panelSessions).values({
      tokenHash: hash(sessionToken),
      adminTelegramId: login.adminTelegramId,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    });
    return { sessionToken, adminTelegramId: login.adminTelegramId };
  });
}

/** The admin behind a live session token, if any. */
export async function resolveSessionAdmin(
  db: Db,
  sessionToken: string,
  now = new Date(),
): Promise<number | undefined> {
  const [row] = await db
    .select({ adminTelegramId: panelSessions.adminTelegramId })
    .from(panelSessions)
    .where(and(eq(panelSessions.tokenHash, hash(sessionToken)), gt(panelSessions.expiresAt, now)));
  return row?.adminTelegramId;
}
