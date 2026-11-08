import { desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { recordAudit } from '../audit/index.js';
import { listBroadcastRecipients } from '../customers/index.js';
import { broadcasts } from './schema.js';

export type Broadcast = typeof broadcasts.$inferSelect;

/** Records a broadcast to every non-banned customer and returns it with its recipients. */
export async function createBroadcast(
  db: Db,
  input: { text: string; actor: number },
): Promise<{ broadcast: Broadcast; recipients: number[] }> {
  const recipients = await listBroadcastRecipients(db);
  return db.transaction(async (tx) => {
    const [broadcast] = await tx
      .insert(broadcasts)
      .values({ text: input.text, total: recipients.length, createdByTelegramId: input.actor })
      .returning();
    if (!broadcast) throw new Error('createBroadcast: insert returned no row');
    await recordAudit(tx, {
      adminTelegramId: input.actor,
      action: 'broadcast.send',
      entityType: 'broadcast',
      entityId: broadcast.id,
      data: { recipients: recipients.length },
    });
    return { broadcast, recipients };
  });
}

export async function updateProgress(
  db: Db,
  id: number,
  progress: { sent: number; failed: number; done: boolean },
): Promise<void> {
  await db
    .update(broadcasts)
    .set({
      sent: progress.sent,
      failed: progress.failed,
      ...(progress.done ? { status: 'done' as const, finishedAt: new Date() } : {}),
    })
    .where(eq(broadcasts.id, id));
}

export async function listBroadcasts(db: Db, limit = 20): Promise<Broadcast[]> {
  return db.select().from(broadcasts).orderBy(desc(broadcasts.id)).limit(limit);
}
