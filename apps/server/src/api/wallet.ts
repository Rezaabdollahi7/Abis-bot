import {
  type ApiError,
  type AuditEntryDto,
  type CustomerProfileDto,
  type CustomerSummaryDto,
  type LedgerEntryDto,
  type TopupDto,
  adjustmentInput,
  approveTopupInput,
  rejectTopupInput,
  toman,
} from '@abis/shared';
import { type Api, InlineKeyboard } from 'grammy';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { cb } from '../bot/keyboards.js';
import { texts } from '../bot/texts.js';
import { announceTopupDecision } from '../bot/topup-alerts.js';
import type { Db } from '../db/client.js';
import { listRecentAudit } from '../modules/audit/index.js';
import {
  type Customer,
  getCustomer,
  getCustomersByIds,
  namesByTelegramId,
  searchCustomers,
} from '../modules/customers/index.js';
import { listBankCards } from '../modules/settings/index.js';
import {
  AdjustmentError,
  type DecisionResult,
  type LedgerEntry,
  type Topup,
  approveTopup,
  createAdjustment,
  getBalance,
  getBalances,
  getTopup,
  listLedger,
  listTopups,
  rejectTopup,
} from '../modules/wallet/index.js';
import { parseBody } from './body.js';
import type { ApiEnv } from './index.js';

const LIST_LIMIT = 100;

export function walletRoutes(db: Db, telegram: Api, botToken: string): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();
  const actor = (c: Context<ApiEnv>) => c.get('admin').telegramId;
  const id = (c: Context<ApiEnv>) => Number(c.req.param('id'));

  // ── Top-ups ──

  routes.get('/topups', async (c) => {
    const status = z
      .enum(['pending', 'approved', 'rejected'])
      .catch('pending')
      .parse(c.req.query('status'));
    return c.json(await toTopupDtos(db, await listTopups(db, status, LIST_LIMIT)));
  });

  routes.get('/topups/:id{[0-9]+}/receipt', async (c) => {
    const topup = await getTopup(db, id(c));
    if (!topup) return c.json<ApiError>({ error: 'not_found' }, 404);
    const file = await telegram.getFile(topup.receiptFileId);
    if (!file.file_path) return c.json<ApiError>({ error: 'not_found' }, 404);
    const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
    if (!res.ok || !res.body) return c.json<ApiError>({ error: 'not_found' }, 404);
    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  });

  async function decided(c: Context<ApiEnv>, result: DecisionResult) {
    if (!result.ok) {
      if (!result.topup) return c.json<ApiError>({ error: 'not_found' }, 404);
      return c.json<ApiError>(
        { error: 'conflict', message: 'این درخواست قبلاً بررسی شده است' },
        409,
      );
    }
    await announceTopupDecision(telegram, db, result);
    const [dto] = await toTopupDtos(db, [result.topup]);
    return c.json(dto);
  }

  routes.post('/topups/:id{[0-9]+}/approve', async (c) => {
    const input = await parseBody(c, approveTopupInput);
    if (!input.ok) return input.response;
    const amount = input.data.amountToman;
    return decided(
      c,
      await approveTopup(db, {
        topupId: id(c),
        actor: actor(c),
        amount: amount === undefined ? undefined : toman(amount),
      }),
    );
  });

  routes.post('/topups/:id{[0-9]+}/reject', async (c) => {
    const input = await parseBody(c, rejectTopupInput);
    if (!input.ok) return input.response;
    return decided(
      c,
      await rejectTopup(db, { topupId: id(c), actor: actor(c), reason: input.data.reason }),
    );
  });

  // ── Customers ──

  routes.get('/customers', async (c) => {
    const customers = await searchCustomers(db, c.req.query('q') ?? '', LIST_LIMIT);
    const balances = await getBalances(
      db,
      customers.map((x) => x.id),
    );
    return c.json(customers.map((x) => toCustomerSummary(x, balances.get(x.id) ?? 0)));
  });

  routes.get('/customers/:id{[0-9]+}', async (c) => {
    const customer = await getCustomer(db, id(c));
    if (!customer) return c.json<ApiError>({ error: 'not_found' }, 404);
    const [balance, ledger] = await Promise.all([
      getBalance(db, customer.id),
      listLedger(db, customer.id, LIST_LIMIT),
    ]);
    return c.json<CustomerProfileDto>({
      ...toCustomerSummary(customer, balance),
      ledger: ledger.map(toLedgerDto),
    });
  });

  routes.post('/customers/:id{[0-9]+}/adjustments', async (c) => {
    const input = await parseBody(c, adjustmentInput);
    if (!input.ok) return input.response;
    const customer = await getCustomer(db, id(c));
    if (!customer) return c.json<ApiError>({ error: 'not_found' }, 404);
    try {
      const { balance } = await createAdjustment(db, {
        customerId: customer.id,
        amount: toman(input.data.amountToman),
        reason: input.data.reason,
        actor: actor(c),
      });
      await telegram
        .sendMessage(
          customer.telegramId,
          texts.adjusted(toman(input.data.amountToman), input.data.reason, balance),
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text(texts.buttons.home, cb.home),
          },
        )
        .catch((error: unknown) => console.error('Could not notify customer:', error));
      return c.json({ balanceToman: balance }, 201);
    } catch (error) {
      if (error instanceof AdjustmentError) {
        return c.json<ApiError>({ error: 'invalid_input', message: error.message }, 400);
      }
      throw error;
    }
  });

  // ── Audit log ──

  routes.get('/audit', async (c) => {
    const entries = await listRecentAudit(db, LIST_LIMIT);
    const names = await namesByTelegramId(db, [...new Set(entries.map((e) => e.adminTelegramId))]);
    return c.json<AuditEntryDto[]>(
      entries.map((e) => ({
        id: e.id,
        admin: names.get(e.adminTelegramId) ?? String(e.adminTelegramId),
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        data: e.data as Record<string, unknown>,
        createdAt: e.createdAt.toISOString(),
      })),
    );
  });

  return routes;
}

async function toTopupDtos(db: Db, topups: Topup[]): Promise<TopupDto[]> {
  const [customers, cards, names] = await Promise.all([
    getCustomersByIds(db, [...new Set(topups.map((t) => t.customerId))]),
    listBankCards(db),
    namesByTelegramId(
      db,
      topups.flatMap((t) => (t.handledByTelegramId ? [t.handledByTelegramId] : [])),
    ),
  ]);
  return topups.map((t) => {
    const customer = customers.get(t.customerId);
    const card = cards.find((x) => x.id === t.bankCardId);
    return {
      id: t.id,
      status: t.status,
      claimedAmountToman: t.claimedAmountToman,
      approvedAmountToman: t.approvedAmountToman,
      rejectReason: t.rejectReason,
      duplicateOfTopupId: t.duplicateOfTopupId,
      bankCardLabel: card ? `${card.bankName} ****${card.number.slice(-4)}` : '?',
      customer: {
        id: t.customerId,
        telegramId: customer?.telegramId ?? 0,
        firstName: customer?.firstName ?? '?',
        username: customer?.username ?? null,
        phone: customer?.phone ?? null,
      },
      handledBy: t.handledByTelegramId
        ? (names.get(t.handledByTelegramId) ?? String(t.handledByTelegramId))
        : null,
      handledAt: t.handledAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    };
  });
}

function toCustomerSummary(c: Customer, balance: number): CustomerSummaryDto {
  return {
    id: c.id,
    telegramId: c.telegramId,
    firstName: c.firstName,
    lastName: c.lastName,
    username: c.username,
    phone: c.phone,
    isBanned: c.isBanned,
    balanceToman: balance,
    createdAt: c.createdAt.toISOString(),
    lastSeenAt: c.lastSeenAt.toISOString(),
  };
}

function toLedgerDto(e: LedgerEntry): LedgerEntryDto {
  return {
    id: e.id,
    amountToman: e.amountToman,
    kind: e.kind,
    reason: e.reason,
    refType: e.refType,
    refId: e.refId,
    createdAt: e.createdAt.toISOString(),
  };
}
