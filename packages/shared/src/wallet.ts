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

export type OrderStatus = 'queued' | 'delivered' | 'rejected';

export interface OrderDto {
  id: number;
  status: OrderStatus;
  productLine: string;
  deliveryMethod: 'link' | 'ready_account' | 'email_activation';
  quantity: number;
  totalToman: number;
  customer: { id: number; telegramId: number; firstName: string; username: string | null };
  /** Decrypted for admins while retained (email, password, note); empty after the purge. */
  input: Partial<Record<'email' | 'password' | 'note', string>>;
  deliveryNote: string | null;
  rejectReason: string | null;
  handledBy: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export const deliverOrderInput = z.object({ note: z.string().trim().min(1).max(3500) });
export const rejectOrderInput = z.object({ reason: z.string().trim().min(3).max(300) });

export type TicketTopic = 'order' | 'payment' | 'general';
export type TicketStatus = 'awaiting_admin' | 'awaiting_customer' | 'closed';

export interface TicketSummaryDto {
  id: number;
  topic: TicketTopic;
  status: TicketStatus;
  orderId: number | null;
  customer: { id: number; telegramId: number; firstName: string; username: string | null };
  lastMessage: string | null;
  updatedAt: string;
}

export interface TicketMessageDto {
  id: number;
  fromAdmin: string | null;
  text: string | null;
  fileKind: 'photo' | 'document' | null;
  createdAt: string;
}

export interface TicketDetailDto extends TicketSummaryDto {
  orderLine: string | null;
  messages: TicketMessageDto[];
}

export const ticketReplyInput = z.object({ text: z.string().trim().min(1).max(3500) });

export interface WarrantyDto {
  orderId: number;
  status: OrderStatus;
  totalToman: number;
  warrantyEndsAt: string | null;
  underWarranty: boolean;
  suggestedRefundToman: number;
  alreadyRefunded: boolean;
}

export const warrantyRefundInput = z.object({
  amountToman: z.number().int().positive(),
  reason: z.string().trim().min(3).max(300),
});
