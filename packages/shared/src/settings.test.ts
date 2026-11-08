import { describe, expect, it } from 'vitest';
import { isValidCardNumber, normalizeDigits } from './settings.js';

describe('normalizeDigits', () => {
  it('converts Persian and Arabic digits and strips separators', () => {
    expect(normalizeDigits('۶۰۳۷-۹۹۷۵ ٩٩٧٥')).toBe('603799759975');
    expect(normalizeDigits('1,500,000')).toBe('1500000');
    expect(normalizeDigits('۱٬۵۰۰٬۰۰۰')).toBe('1500000');
  });
});

describe('isValidCardNumber', () => {
  it('accepts Luhn-valid 16-digit numbers', () => {
    expect(isValidCardNumber('6037990000000006')).toBe(true);
  });
  it('rejects wrong length or checksum', () => {
    expect(isValidCardNumber('6037990000000007')).toBe(false);
    expect(isValidCardNumber('603799000000000')).toBe(false);
  });
});
