import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { settings } from './schema.js';

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
  db: Db,
  key: K,
  value: Settings[K],
): Promise<void> {
  const parsed: unknown = settingsSchema.shape[key].parse(value);
  await db
    .insert(settings)
    .values({ key, value: parsed })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, updatedAt: new Date() } });
}
