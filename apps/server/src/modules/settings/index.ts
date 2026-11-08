import type { BankCardDto, Patch } from '@abis/shared';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, Executor } from '../../db/client.js';
import { recordAudit } from '../audit/index.js';
import { bankCards, settings } from './schema.js';

/**
 * Every runtime setting with its validation and default.
 * Adding a setting = adding one line here; no migration needed.
 */
const settingsSchema = z.object({
  /** Require channel membership before using the bot. */
  forcedJoin: z.boolean().default(false),
  /** Ask for the Telegram phone number before the first top-up. */
  requirePhone: z.boolean().default(true),
  /** Top-up limits in Toman. */
  topupMinToman: z.number().int().positive().default(50_000),
  topupMaxToman: z.number().int().positive().default(50_000_000),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

/** Reads all settings, falling back to defaults for anything never saved. */
export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.select().from(settings);
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const known = Object.fromEntries(
    Object.keys(settingsSchema.shape).flatMap((key) => (key in stored ? [[key, stored[key]]] : [])),
  );
  return settingsSchema.parse(known);
}

/** Validates and saves one setting. Throws on an invalid value. */
export async function updateSetting<K extends SettingKey>(
  db: Executor,
  key: K,
  value: Settings[K],
): Promise<void> {
  const parsed: unknown = settingsSchema.shape[key].parse(value);
  await db
    .insert(settings)
    .values({ key, value: parsed })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, updatedAt: new Date() } });
}

/** Validates and saves several settings with one audit row. */
export async function updateSettings(
  db: Db,
  actor: number,
  input: Patch<Settings>,
): Promise<Settings> {
  const patch = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<Settings>;
  const merged = settingsSchema.parse({ ...(await getSettings(db)), ...patch });
  if (merged.topupMinToman > merged.topupMaxToman) {
    throw new SettingsError('حداقل شارژ نمی‌تواند از حداکثر بیشتر باشد');
  }
  await db.transaction(async (tx) => {
    for (const key of Object.keys(patch) as SettingKey[]) {
      await updateSetting(tx, key, merged[key]);
    }
    await recordAudit(tx, {
      adminTelegramId: actor,
      action: 'settings.update',
      entityType: 'settings',
      entityId: 0,
      data: patch,
    });
  });
  return merged;
}

export class SettingsError extends Error {}

// ── Bank cards ────────────────────────────────────────────────────────────────

export type BankCard = BankCardDto;

function toDto(row: typeof bankCards.$inferSelect): BankCard {
  return {
    id: row.id,
    number: row.number,
    holderName: row.holderName,
    bankName: row.bankName,
    isActive: row.isActive,
  };
}

export async function listBankCards(db: Db): Promise<BankCard[]> {
  return (await db.select().from(bankCards).orderBy(asc(bankCards.id))).map(toDto);
}

/** The card customers should transfer to, if any. */
export async function getActiveBankCard(db: Db): Promise<BankCard | undefined> {
  const [row] = await db.select().from(bankCards).where(eq(bankCards.isActive, true));
  return row ? toDto(row) : undefined;
}

export async function addBankCard(
  db: Db,
  actor: number,
  input: { number: string; holderName: string; bankName: string },
): Promise<BankCard> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(bankCards).values(input).returning();
    if (!row) throw new Error('addBankCard: insert returned no row');
    await recordAudit(tx, {
      adminTelegramId: actor,
      action: 'bank_card.create',
      entityType: 'bank_card',
      entityId: row.id,
      data: { bankName: input.bankName, last4: input.number.slice(-4) },
    });
    return toDto(row);
  });
}

/** Makes one card active (deactivating the current one), or none with `null`. */
export async function setActiveBankCard(
  db: Db,
  actor: number,
  cardId: number | null,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.update(bankCards).set({ isActive: false }).where(eq(bankCards.isActive, true));
    if (cardId !== null) {
      const [row] = await tx
        .update(bankCards)
        .set({ isActive: true })
        .where(eq(bankCards.id, cardId))
        .returning();
      if (!row) return false;
    }
    await recordAudit(tx, {
      adminTelegramId: actor,
      action: 'bank_card.activate',
      entityType: 'bank_card',
      entityId: cardId ?? 0,
    });
    return true;
  });
}
