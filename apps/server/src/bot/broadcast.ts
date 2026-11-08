import { type Api, GrammyError } from 'grammy';
import type { Db } from '../db/client.js';
import { type Broadcast, updateProgress } from '../modules/broadcasts/index.js';

/** Telegram allows about 30 messages per second per bot; stay below it. */
const MESSAGES_PER_SECOND = 25;

export interface BroadcastOptions {
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends a broadcast one message at a time at a safe rate. On a 429 it waits
 * the time Telegram asks for and retries once; blocked/deleted users count as failed.
 * Progress is saved every 50 messages so the panel can show it.
 */
export async function sendBroadcast(
  api: Api,
  db: Db,
  broadcast: Broadcast,
  recipients: number[],
  options: BroadcastOptions = {},
): Promise<{ sent: number; failed: number }> {
  const sleep = options.sleep ?? realSleep;
  let sent = 0;
  let failed = 0;

  for (const [index, chatId] of recipients.entries()) {
    const attempt = () => api.sendMessage(chatId, broadcast.text);
    try {
      await attempt();
      sent++;
    } catch (error) {
      const retryAfter =
        error instanceof GrammyError && error.error_code === 429
          ? (error.parameters.retry_after ?? 1)
          : undefined;
      if (retryAfter === undefined) {
        failed++;
      } else {
        await sleep(retryAfter * 1000);
        await attempt().then(
          () => sent++,
          () => failed++,
        );
      }
    }
    if ((index + 1) % 50 === 0)
      await updateProgress(db, broadcast.id, { sent, failed, done: false });
    await sleep(1000 / MESSAGES_PER_SECOND);
  }

  await updateProgress(db, broadcast.id, { sent, failed, done: true });
  return { sent, failed };
}
