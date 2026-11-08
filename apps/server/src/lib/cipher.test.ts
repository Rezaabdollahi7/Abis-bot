import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCipher } from './cipher.js';

const key = randomBytes(32).toString('base64');

describe('cipher', () => {
  it('round-trips unicode text and never repeats a ciphertext', () => {
    const cipher = createCipher(key);
    const secret = 'user@mail.com\nرمز: ۱۲۳۴';
    const a = cipher.encrypt(secret);
    const b = cipher.encrypt(secret);
    expect(a).not.toBe(b);
    expect(a).not.toContain('user@mail.com');
    expect(cipher.decrypt(a)).toBe(secret);
  });

  it('fails on tampering or a different key', () => {
    const cipher = createCipher(key);
    const encoded = cipher.encrypt('secret');
    const tampered = encoded.slice(0, -4) + (encoded.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => cipher.decrypt(tampered)).toThrow();
    expect(() => createCipher(randomBytes(32).toString('base64')).decrypt(encoded)).toThrow();
  });

  it('rejects a key of the wrong size', () => {
    expect(() => createCipher(randomBytes(16).toString('base64'))).toThrow('32 random bytes');
  });
});
