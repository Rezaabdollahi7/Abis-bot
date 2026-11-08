import { z } from 'zod';

const telegramIdList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map(Number),
  )
  .pipe(z.array(z.number().int().positive()).min(1));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  BOT_TOKEN: z.string().min(1),
  OWNER_TELEGRAM_IDS: telegramIdList,
  DATABASE_URL: z.url(),
  /** 32 random bytes, base64. Losing it makes stock and customer passwords unreadable. */
  ENCRYPTION_KEY: z.string().min(1),
  /** Public channel `@username` (or numeric id) for the channel button and forced join. */
  CHANNEL_ID: z.string().min(1).optional(),
});

export type Config = z.infer<typeof envSchema>;

/** Parses and validates env at boot; throws with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
