import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const userSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

export type InitDataUser = z.infer<typeof userSchema>;

export class InitDataError extends Error {}

/**
 * Validates Telegram Mini App `initData` (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 * HMAC-SHA256 of the sorted `key=value` lines (all fields except `hash`) with
 * secret = HMAC-SHA256("WebAppData", botToken). Rejects data older than `maxAgeSeconds`.
 */
export function validateInitData(
  initData: string,
  botToken: string,
  options: { maxAgeSeconds: number; now?: Date | undefined },
): InitDataUser {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new InitDataError('missing hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  const received = Buffer.from(hash, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new InitDataError('bad signature');
  }

  const authDate = Number(params.get('auth_date'));
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (!Number.isFinite(authDate) || nowSeconds - authDate > options.maxAgeSeconds) {
    throw new InitDataError('expired');
  }

  const user = userSchema.safeParse(JSON.parse(params.get('user') ?? 'null'));
  if (!user.success) throw new InitDataError('missing user');
  return user.data;
}

/** Test helper: produces initData signed exactly like Telegram does. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const dataCheckString = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
