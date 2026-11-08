import { z } from 'zod';

/** Iranian bank cards are 16 digits and pass the Luhn check. */
export function isValidCardNumber(number: string): boolean {
  if (!/^\d{16}$/.test(number)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let digit = Number(number[15 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Converts Persian/Arabic digits to ASCII and drops spaces and dashes. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\s\-_,٬،]/g, '');
}

export const bankCardInput = z.object({
  number: z.string().transform(normalizeDigits).refine(isValidCardNumber, 'شماره کارت معتبر نیست'),
  holderName: z.string().trim().min(2).max(64),
  bankName: z.string().trim().min(2).max(32),
});
export type BankCardInput = z.input<typeof bankCardInput>;

export interface BankCardDto {
  id: number;
  number: string;
  holderName: string;
  bankName: string;
  isActive: boolean;
}

export const settingsPatch = z
  .object({
    forcedJoin: z.boolean(),
    requirePhone: z.boolean(),
    topupMinToman: z.number().int().positive(),
    topupMaxToman: z.number().int().positive(),
  })
  .partial();
export type SettingsPatch = z.infer<typeof settingsPatch>;

export interface SettingsDto {
  forcedJoin: boolean;
  requirePhone: boolean;
  topupMinToman: number;
  topupMaxToman: number;
}

export interface SettingsResponse {
  settings: SettingsDto;
  bankCards: BankCardDto[];
}
