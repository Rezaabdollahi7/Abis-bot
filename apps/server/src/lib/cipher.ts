import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Encrypts sensitive text at rest (stock payloads, customer passwords) — RULES.md #7. */
export interface Cipher {
  encrypt(plaintext: string): string;
  decrypt(encoded: string): string;
}

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM with a random 12-byte IV per value.
 * Format: `v1:<base64(iv | authTag | ciphertext)>`; the version prefix allows key rotation later.
 */
export function createCipher(keyBase64: string): Cipher {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 random bytes, base64-encoded');
  }
  return {
    encrypt(plaintext) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
    },
    decrypt(encoded) {
      const [version, data] = encoded.split(':', 2);
      if (version !== VERSION || !data) throw new Error('Unknown ciphertext format');
      const raw = Buffer.from(data, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
      decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([
        decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
