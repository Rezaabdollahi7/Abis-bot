import { type Toman, toman } from '@abis/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db, Executor } from '../../db/client.js';
import { recordAudit } from '../audit/index.js';
import { lockCustomer } from '../customers/index.js';
import { ledgerEntries, topups } from './schema.js';

export type Topup = typeof topups.$inferSelect;
export type TopupStatus = Topup['status'];
export type LedgerEntry = typeof ledgerEntries.$inferSelect;

/** Balance = sum of the customer's ledger entries (ADR-0003). */
export async function getBalance(db: Executor, customerId: number): Promise<Toman> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amountToman}), 0)`.mapWith(Number) })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.customerId, customerId));
  return toman(row?.total ?? 0);
}

/** Appends a ledger entry inside a caller's transaction (purchases, refunds). */
export async function recordLedgerEntry(
  tx: Executor,
  entry: {
    customerId: number;
    amount: Toman;
    kind: 'purchase' | 'refund';
    refType: string;
    refId: number;
    reason?: string | undefined;
    createdByAdminTelegramId?: number | undefined;
  },
): Promise<void> {
  await tx.insert(ledgerEntries).values({
    customerId: entry.customerId,
    amountToman: entry.amount,
    kind: entry.kind,
    refType: entry.refType,
    refId: entry.refId,
    reason: entry.reason ?? null,
    createdByAdminTelegramId: entry.createdByAdminTelegramId ?? null,
  });
}

// ── Top-ups ───────────────────────────────────────────────────────────────────

export async function createTopup(
  db: Db,
  input: {
    customerId: number;
    amount: Toman;
    bankCardId: number;
    receiptFileId: string;
    receiptFileUniqueId: string;
  },
): Promise<Topup> {
  // An image already used by any earlier top-up is flagged for the admins (fraud signal).
  const [earlier] = await db
    .select({ id: topups.id })
    .from(topups)
    .where(eq(topups.receiptFileUniqueId, input.receiptFileUniqueId))
    .orderBy(asc(topups.id))
    .limit(1);
  const [row] = await db
    .insert(topups)
    .values({
      customerId: input.customerId,
      claimedAmountToman: input.amount,
      bankCardId: input.bankCardId,
      receiptFileId: input.receiptFileId,
      receiptFileUniqueId: input.receiptFileUniqueId,
      duplicateOfTopupId: earlier?.id ?? null,
    })
    .returning();
  if (!row) throw new Error('createTopup: insert returned no row');
  return row;
}

export async function getTopup(db: Db, id: number): Promise<Topup | undefined> {
  const [row] = await db.select().from(topups).where(eq(topups.id, id));
  return row;
}

export type DecisionResult =
  | { ok: true; topup: Topup; balance: Toman }
  /** Someone else decided first (or the id is unknown); `topup` is its current state. */
  | { ok: false; topup: Topup | undefined };

/**
 * Approves a pending top-up exactly once, crediting `amount` (defaults to the claimed amount).
 * The guarded UPDATE serialises concurrent admins: the second one matches zero rows.
 */
export async function approveTopup(
  db: Db,
  input: { topupId: number; actor: number; amount?: Toman | undefined },
): Promise<DecisionResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(topups).where(eq(topups.id, input.topupId));
    if (!current) return { ok: false, topup: undefined };
    const amount = input.amount ?? toman(current.claimedAmountToman);

    const [topup] = await tx
      .update(topups)
      .set({
        status: 'approved',
        approvedAmountToman: amount,
        handledByTelegramId: input.actor,
        handledAt: new Date(),
      })
      .where(and(eq(topups.id, input.topupId), eq(topups.status, 'pending')))
      .returning();
    if (!topup) return { ok: false, topup: await reload(tx, input.topupId) };

    await tx.insert(ledgerEntries).values({
      customerId: topup.customerId,
      amountToman: amount,
      kind: 'topup',
      refType: 'topup',
      refId: topup.id,
      createdByAdminTelegramId: input.actor,
    });
    await recordAudit(tx, {
      adminTelegramId: input.actor,
      action: 'topup.approve',
      entityType: 'topup',
      entityId: topup.id,
      data: { claimed: topup.claimedAmountToman, approved: amount },
    });
    return { ok: true, topup, balance: await getBalance(tx, topup.customerId) };
  });
}

export async function rejectTopup(
  db: Db,
  input: { topupId: number; actor: number; reason: string },
): Promise<DecisionResult> {
  return db.transaction(async (tx) => {
    const [topup] = await tx
      .update(topups)
      .set({
        status: 'rejected',
        rejectReason: input.reason,
        handledByTelegramId: input.actor,
        handledAt: new Date(),
      })
      .where(and(eq(topups.id, input.topupId), eq(topups.status, 'pending')))
      .returning();
    if (!topup) return { ok: false, topup: await reload(tx, input.topupId) };
    await recordAudit(tx, {
      adminTelegramId: input.actor,
      action: 'topup.reject',
      entityType: 'topup',
      entityId: topup.id,
      data: { reason: input.reason },
    });
    return { ok: true, topup, balance: await getBalance(tx, topup.customerId) };
  });
}

async function reload(exec: Executor, id: number): Promise<Topup | undefined> {
  const [row] = await exec.select().from(topups).where(eq(topups.id, id));
  return row;
}

export async function getBalances(db: Db, customerIds: number[]): Promise<Map<number, Toman>> {
  if (customerIds.length === 0) return new Map();
  const rows = await db
    .select({
      customerId: ledgerEntries.customerId,
      total: sql<number>`sum(${ledgerEntries.amountToman})`.mapWith(Number),
    })
    .from(ledgerEntries)
    .where(inArray(ledgerEntries.customerId, customerIds))
    .groupBy(ledgerEntries.customerId);
  return new Map(rows.map((r) => [r.customerId, toman(r.total)]));
}

export async function listLedger(
  db: Db,
  customerId: number,
  limit: number,
): Promise<LedgerEntry[]> {
  return db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.customerId, customerId))
    .orderBy(desc(ledgerEntries.id))
    .limit(limit);
}

/** Pending: oldest first (work queue). Decided: newest first (history). */
export async function listTopups(db: Db, status: TopupStatus, limit: number): Promise<Topup[]> {
  return db
    .select()
    .from(topups)
    .where(eq(topups.status, status))
    .orderBy(status === 'pending' ? asc(topups.id) : desc(topups.handledAt))
    .limit(limit);
}

export class AdjustmentError extends Error {}

/**
 * A manual ledger entry by an admin, always with a reason (RULES.md #2).
 * Debits may not take the wallet below zero; the customer row is locked so
 * a concurrent purchase cannot slip in between the check and the insert.
 */
export async function createAdjustment(
  db: Db,
  input: { customerId: number; amount: Toman; reason: string; actor: number },
): Promise<{ entry: LedgerEntry; balance: Toman }> {
  return db.transaction(async (tx) => {
    if (!(await lockCustomer(tx, input.customerId))) {
      throw new AdjustmentError('مشتری پیدا نشد');
    }
    const before = await getBalance(tx, input.customerId);
    if (before + input.amount < 0) {
      throw new AdjustmentError('موجودی کیف پول برای این کسر کافی نیست');
    }
    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        customerId: input.customerId,
        amountToman: input.amount,
        kind: 'adjustment',
        reason: input.reason,
        createdByAdminTelegramId: input.actor,
      })
      .returning();
    if (!entry) throw new Error('createAdjustment: insert returned no row');
    await recordAudit(tx, {
      adminTelegramId: input.actor,
      action: 'wallet.adjust',
      entityType: 'customer',
      entityId: input.customerId,
      data: { amount: input.amount, reason: input.reason },
    });
    return { entry, balance: toman(before + input.amount) };
  });
}
