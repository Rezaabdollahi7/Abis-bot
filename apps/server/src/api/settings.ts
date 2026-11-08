import { type ApiError, type SettingsResponse, bankCardInput, settingsPatch } from '@abis/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import {
  SettingsError,
  addBankCard,
  getSettings,
  listBankCards,
  setActiveBankCard,
  updateSettings,
} from '../modules/settings/index.js';
import { parseBody } from './body.js';
import type { ApiEnv } from './index.js';

export function settingsRoutes(db: Db): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  const snapshot = async (): Promise<SettingsResponse> => ({
    settings: await getSettings(db),
    bankCards: await listBankCards(db),
  });

  routes.get('/settings', async (c) => c.json(await snapshot()));

  routes.patch('/settings', async (c) => {
    const input = await parseBody(c, settingsPatch);
    if (!input.ok) return input.response;
    try {
      await updateSettings(db, c.get('admin').telegramId, input.data);
    } catch (error) {
      if (error instanceof SettingsError) {
        return c.json<ApiError>({ error: 'invalid_input', message: error.message }, 400);
      }
      throw error;
    }
    return c.json(await snapshot());
  });

  routes.post('/bank-cards', async (c) => {
    const input = await parseBody(c, bankCardInput);
    if (!input.ok) return input.response;
    await addBankCard(db, c.get('admin').telegramId, input.data);
    return c.json(await snapshot(), 201);
  });

  routes.put('/bank-cards/active', async (c) => {
    const input = await parseBody(c, z.object({ cardId: z.number().int().positive().nullable() }));
    if (!input.ok) return input.response;
    const ok = await setActiveBankCard(db, c.get('admin').telegramId, input.data.cardId);
    if (!ok) return c.json<ApiError>({ error: 'not_found' }, 404);
    return c.json(await snapshot());
  });

  return routes;
}
