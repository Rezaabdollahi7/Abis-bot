import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db.js';
import { findCustomerByTelegramId, registerCustomer } from './index.js';

const getDb = useTestDb();

describe('registerCustomer', () => {
  it('creates a customer on first contact', async () => {
    const customer = await registerCustomer(getDb(), { telegramId: 42, firstName: 'Reza' });
    expect(customer).toMatchObject({ telegramId: 42, firstName: 'Reza', isBanned: false });
  });

  it('updates the profile on later contact without duplicating', async () => {
    const first = await registerCustomer(getDb(), { telegramId: 42, firstName: 'Reza' });
    const second = await registerCustomer(getDb(), {
      telegramId: 42,
      firstName: 'Reza',
      username: 'reza_new',
    });
    expect(second.id).toBe(first.id);
    expect(second.username).toBe('reza_new');
    expect((await findCustomerByTelegramId(getDb(), 42))?.username).toBe('reza_new');
  });
});
