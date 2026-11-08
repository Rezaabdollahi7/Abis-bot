import { describe, expect, it } from 'vitest';
import { formatToman, toman } from './money.js';

describe('toman', () => {
  it('accepts integers, including negative ledger amounts', () => {
    expect(toman(800_000)).toBe(800_000);
    expect(toman(-50_000)).toBe(-50_000);
  });

  it('rejects fractions and unsafe integers', () => {
    expect(() => toman(1.5)).toThrow(RangeError);
    expect(() => toman(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});

describe('formatToman', () => {
  it('uses Persian digits and grouping', () => {
    expect(formatToman(toman(800_000))).toBe('۸۰۰٬۰۰۰ تومان');
  });
});
