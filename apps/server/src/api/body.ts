import type { ApiError } from '@abis/shared';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { ApiEnv } from './index.js';

/** Parses a JSON body with a zod schema; on failure returns a ready 400 response. */
export async function parseBody<T extends z.ZodType>(
  c: Context<ApiEnv>,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  const body: unknown = await c.req.json().catch(() => undefined);
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    response: c.json<ApiError>({ error: 'invalid_input', message: result.error.message }, 400),
  };
}
