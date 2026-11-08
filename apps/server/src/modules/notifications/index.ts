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
