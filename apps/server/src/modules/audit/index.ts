import { desc } from 'drizzle-orm';
import type { Db, Executor } from '../../db/client.js';
import { auditLog } from './schema.js';

export type AuditEntry = typeof auditLog.$inferSelect;

export interface AuditInput {
  adminTelegramId: number;
  /** Dotted verb, e.g. `provider.create`, `topup.approve`. */
  action: string;
  entityType: string;
  entityId: number;
  data?: Record<string, unknown>;
}

/** Records an admin action. Pass the transaction that performs the action. */
export async function recordAudit(exec: Executor, input: AuditInput): Promise<void> {
  await exec.insert(auditLog).values({ ...input, data: input.data ?? {} });
}

export async function listRecentAudit(db: Db, limit: number): Promise<AuditEntry[]> {
  return db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(limit);
}
