import { createCipher } from '../lib/cipher.js';

/** Fixed test key (never used outside tests). */
export const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
export const testCipher = createCipher(TEST_ENCRYPTION_KEY);
