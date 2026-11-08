import { type AdminDto, type ApiError, type DashboardDto, addAdminInput } from '@abis/shared';
import { Hono } from 'hono';
import { formatDuration } from '../bot/texts.js';
import type { Db } from '../db/client.js';
import { addAdmin, listAddedAdmins, removeAdmin } from '../modules/admins/index.js';
import { getFullCatalog } from '../modules/catalog/index.js';
import { countCustomersSince, namesByTelegramId } from '../modules/customers/index.js';
import { countQueuedOrders, salesSince } from '../modules/orders/index.js';
import { getSettings } from '../modules/settings/index.js';
import { countTicketsAwaitingAdmin } from '../modules/tickets/index.js';
import { countPendingTopups, topupsSince } from '../modules/wallet/index.js';
import { parseBody } from './body.js';
import type { ApiEnv } from './index.js';

const DAY_MS = 86_400_000;
/** Iran has used a fixed UTC+03:30 offset since 2022 (no DST). */
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

/** Midnight in Tehran for the given instant, as a UTC Date. */
export function startOfTehranDay(now: Date): Date {
  const local = now.getTime() + TEHRAN_OFFSET_MS;
  return new Date(local - (local % DAY_MS) - TEHRAN_OFFSET_MS);
}

export function dashboardRoutes(
  db: Db,
  ownerIds: readonly number[],
  now: () => Date = () => new Date(),
): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  async function period(since: Date) {
    const [sales, topups, newCustomers] = await Promise.all([
      salesSince(db, since),
      topupsSince(db, since),
      countCustomersSince(db, since),
    ]);
    return { sales, topups, newCustomers };
  }

  routes.get('/dashboard', async (c) => {
    const today = startOfTehranDay(now());
    const [todayStats, week, month, topups, orders, tickets, catalog, settings] = await Promise.all(
      [
        period(today),
        period(new Date(today.getTime() - 6 * DAY_MS)),
        period(new Date(today.getTime() - 29 * DAY_MS)),
        countPendingTopups(db),
        countQueuedOrders(db),
        countTicketsAwaitingAdmin(db),
        getFullCatalog(db),
        getSettings(db),
      ],
    );
    const lowStock = catalog.flatMap((provider) =>
      provider.isActive
        ? provider.products.flatMap((product) =>
            product.isActive
              ? product.variants.flatMap((v) =>
                  v.isActive && v.stock !== null && v.stock <= settings.lowStockThreshold
                    ? [
                        {
                          variantId: v.id,
                          line: `${provider.emoji} ${product.name} · ${formatDuration(v.durationDays)}`,
                          stock: v.stock,
                        },
                      ]
                    : [],
                )
              : [],
          )
        : [],
    );
    return c.json<DashboardDto>({
      today: todayStats,
      week,
      month,
      pending: { topups, orders, tickets },
      lowStock,
    });
  });

  routes.get('/admins', async (c) => {
    const added = await listAddedAdmins(db);
    const ids = [...ownerIds, ...added.map((a) => a.telegramId)];
    const names = await namesByTelegramId(db, ids);
    return c.json<AdminDto[]>(
      ids.map((telegramId) => ({
        telegramId,
        name: names.get(telegramId) ?? null,
        isOwner: ownerIds.includes(telegramId),
      })),
    );
  });

  routes.post('/admins', async (c) => {
    const input = await parseBody(c, addAdminInput);
    if (!input.ok) return input.response;
    if (ownerIds.includes(input.data.telegramId)) {
      return c.json<ApiError>({ error: 'invalid_input', message: 'این کاربر مالک است' }, 400);
    }
    await addAdmin(db, input.data.telegramId, c.get('admin').telegramId);
    return c.json({ ok: true }, 201);
  });

  routes.delete('/admins/:telegramId{[0-9]+}', async (c) => {
    const telegramId = Number(c.req.param('telegramId'));
    if (ownerIds.includes(telegramId)) {
      return c.json<ApiError>({ error: 'forbidden', message: 'مالک‌ها حذف‌شدنی نیستند' }, 403);
    }
    const removed = await removeAdmin(db, telegramId, c.get('admin').telegramId);
    return removed ? c.body(null, 204) : c.json<ApiError>({ error: 'not_found' }, 404);
  });

  return routes;
}
