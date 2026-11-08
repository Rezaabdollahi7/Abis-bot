import { describe, expect, it } from 'vitest';
import { InitDataError, signInitData, validateInitData } from './init-data.js';

const TOKEN = '123:secret';
const now = new Date('2026-11-08T12:00:00Z');
const authDate = String(Math.floor(now.getTime() / 1000) - 60);
const user = JSON.stringify({ id: 42, first_name: 'Reza' });

describe('validateInitData', () => {
  it('accepts correctly signed, fresh data and returns the user', () => {
    const initData = signInitData({ auth_date: authDate, user, query_id: 'q' }, TOKEN);
    expect(validateInitData(initData, TOKEN, { maxAgeSeconds: 3600, now })).toMatchObject({
      id: 42,
      first_name: 'Reza',
    });
  });

  it('rejects data signed with another bot token', () => {
    const initData = signInitData({ auth_date: authDate, user }, '999:other');
    expect(() => validateInitData(initData, TOKEN, { maxAgeSeconds: 3600, now })).toThrow(
      InitDataError,
    );
  });

  it('rejects tampered data', () => {
    const initData = signInitData({ auth_date: authDate, user }, TOKEN).replace('42', '43');
    expect(() => validateInitData(initData, TOKEN, { maxAgeSeconds: 3600, now })).toThrow(
      'bad signature',
    );
  });

  it('rejects stale data', () => {
    const initData = signInitData({ auth_date: authDate, user }, TOKEN);
    expect(() => validateInitData(initData, TOKEN, { maxAgeSeconds: 30, now })).toThrow('expired');
  });
});
