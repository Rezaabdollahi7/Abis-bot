import { z } from 'zod';

/** Preset reasons for rejecting a top-up (bot alert buttons and the panel). */
export const topupRejectReasons = [
  'واریزی با این مشخصات پیدا نشد',
  'مبلغ واریزی با مبلغ اعلام‌شده مغایرت دارد',
  'تصویر رسید نامعتبر یا ناخوانا است',
  'این رسید تکراری است',
] as const;

export type TopupStatus = 'pending' | 'approved' | 'rejected';

export interface TopupDto {
  id: number;
  status: TopupStatus;
  claimedAmountToman: number;
  approvedAmountToman: number | null;
  rejectReason: string | null;
  duplicateOfTopupId: number | null;
  bankCardLabel: string;
  customer: {
    id: number;
    telegramId: number;
    firstName: string;
    username: string | null;
    phone: string | null;
  };
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
}

export const approveTopupInput = z.object({
  /** Corrected amount; omit to credit the claimed amount. */
  amountToman: z.number().int().positive().optional(),
});
export const rejectTopupInput = z.object({ reason: z.string().trim().min(3).max(300) });

export type LedgerKind = 'topup' | 'purchase' | 'refund' | 'adjustment';

export interface LedgerEntryDto {
  id: number;
  amountToman: number;
  kind: LedgerKind;
  reason: string | null;
  refType: string | null;
  refId: number | null;
  createdAt: string;
}

export interface CustomerSummaryDto {
  id: number;
  telegramId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  isBanned: boolean;
  balanceToman: number;
  createdAt: string;
  lastSeenAt: string;
}

export interface CustomerProfileDto extends CustomerSummaryDto {
  ledger: LedgerEntryDto[];
}

export const adjustmentInput = z.object({
  /** Signed: positive credits, negative debits (e.g. a withdrawal paid out by card). */
  amountToman: z
    .number()
    .int()
    .refine((n) => n !== 0, 'مبلغ نباید صفر باشد'),
  reason: z.string().trim().min(3).max(300),
});
export type AdjustmentInput = z.infer<typeof adjustmentInput>;

export interface AuditEntryDto {
  id: number;
  admin: string;
  action: string;
  entityType: string;
  entityId: number;
  data: Record<string, unknown>;
  createdAt: string;
}
