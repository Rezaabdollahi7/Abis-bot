import type { ApiError } from '@abis/shared';
import type { Api } from 'grammy';
import type { Context } from 'hono';
import type { ApiEnv } from './index.js';

/** Streams a Telegram file to the panel so the bot token never reaches the browser. */
export async function streamTelegramFile(
  c: Context<ApiEnv>,
  telegram: Api,
  botToken: string,
  fileId: string,
): Promise<Response> {
  const file = await telegram.getFile(fileId);
  if (!file.file_path) return c.json<ApiError>({ error: 'not_found' }, 404);
  const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
  if (!res.ok || !res.body) return c.json<ApiError>({ error: 'not_found' }, 404);
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
