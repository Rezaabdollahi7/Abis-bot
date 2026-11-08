import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { adminNotifications } from './schema.js';

export interface SentNotification {
  chatId: number;
  messageId: number;
}

export async function recordNotifications(
  db: Db,
  entity: { type: string; id: number },
  sent: SentNotification[],
): Promise<void> {
  if (sent.length === 0) return;
  await db
    .insert(adminNotifications)
    .values(sent.map((s) => ({ entityType: entity.type, entityId: entity.id, ...s })));
}

export async function listNotifications(
  db: Db,
  entity: { type: string; id: number },
): Promise<SentNotification[]> {
  return db
    .select({ chatId: adminNotifications.chatId, messageId: adminNotifications.messageId })
    .from(adminNotifications)
    .where(
      and(
        eq(adminNotifications.entityType, entity.type),
        eq(adminNotifications.entityId, entity.id),
      ),
    );
}

/** Which entity an admin alert message belongs to (to act on a Reply to it). */
export async function findNotificationEntity(
  db: Db,
  chatId: number,
  messageId: number,
): Promise<{ type: string; id: number } | undefined> {
  const [row] = await db
    .select({ type: adminNotifications.entityType, id: adminNotifications.entityId })
    .from(adminNotifications)
    .where(and(eq(adminNotifications.chatId, chatId), eq(adminNotifications.messageId, messageId)));
  return row;
}
