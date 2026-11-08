import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const validEnv = {
  BOT_TOKEN: '123:abc',
  OWNER_TELEGRAM_IDS: '111, 222',
  DATABASE_URL: 'postgres://abis:pw@localhost:5432/abis',
};

describe('loadConfig', () => {
  it('parses owner ids and applies defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.OWNER_TELEGRAM_IDS).toEqual([111, 222]);
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
  });

  it('fails loudly when a required variable is missing', () => {
    expect(() => loadConfig({ ...validEnv, BOT_TOKEN: undefined })).toThrow(/BOT_TOKEN/);
  });

  it('rejects non-numeric owner ids', () => {
    expect(() => loadConfig({ ...validEnv, OWNER_TELEGRAM_IDS: 'abc' })).toThrow(
      /OWNER_TELEGRAM_IDS/,
    );
  });
});
