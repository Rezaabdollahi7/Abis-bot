import { toman } from '@abis/shared';
import { type Api, Composer, GrammyError, InlineKeyboard } from 'grammy';
import type { Db } from '../db/client.js';
import { listAdminTelegramIds, resolveAdmin } from '../modules/admins/index.js';
import { getCustomer, namesByTelegramId } from '../modules/customers/index.js';
import { listNotifications, recordNotifications } from '../modules/notifications/index.js';
import { pendingPurchaseVariant } from '../modules/orders/index.js';
import { listBankCards } from '../modules/settings/index.js';
import {
  type DecisionResult,
  type Topup,
  approveTopup,
  getTopup,
  rejectTopup,
} from '../modules/wallet/index.js';
import type { BotContext } from './context.js';
import { cb } from './keyboards.js';
import { texts, topupRejectReasons } from './texts.js';

const ENTITY = 'topup';
const alertCb = {
  approve: (id: number) => `tp:a:${id}`,
  rejectMenu: (id: number) => `tp:r:${id}`,
  reject: (id: number, reason: number) => `tp:x:${id}:${reason}`,
  back: (id: number) => `tp:b:${id}`,
};

async function renderAlert(db: Db, topup: Topup): Promise<string> {
  const [customer, cards, names] = await Promise.all([
    getCustomer(db, topup.customerId),
    listBankCards(db),
    namesByTelegramId(db, topup.handledByTelegramId ? [topup.handledByTelegramId] : []),
  ]);
  const card = cards.find((c) => c.id === topup.bankCardId);
  const admin = topup.handledByTelegramId
    ? (names.get(topup.handledByTelegramId) ?? String(topup.handledByTelegramId))
    : '';
  const status =
    topup.status === 'approved'
      ? texts.topupStatusApproved(admin, toman(topup.approvedAmountToman ?? 0))
      : topup.status === 'rejected'
        ? texts.topupStatusRejected(admin, topup.rejectReason ?? '')
        : null;
  return texts.topupAlert({
    topupId: topup.id,
    customerName: customer?.firstName ?? '?',
    username: customer?.username ?? null,
    telegramId: customer?.telegramId ?? 0,
    phone: customer?.phone ?? null,
    amount: toman(topup.claimedAmountToman),
    cardLabel: card ? `${card.bankName} ****${card.number.slice(-4)}` : '?',
    duplicateOf: topup.duplicateOfTopupId,
    status,
  });
}

function decisionKeyboard(topup: Topup): InlineKeyboard {
  return new InlineKeyboard()
    .text(texts.buttons.approve(toman(topup.claimedAmountToman)), alertCb.approve(topup.id))
    .success()
    .text(texts.buttons.reject, alertCb.rejectMenu(topup.id))
    .danger();
}

function rejectKeyboard(topupId: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  topupRejectReasons.forEach((reason, index) => {
    keyboard.text(reason, alertCb.reject(topupId, index)).row();
  });
  return keyboard.text(texts.buttons.back, alertCb.back(topupId));
}

/** Sends the receipt with decision buttons to every admin and remembers each copy. */
export async function alertAdminsOfTopup(
  api: Api,
  db: Db,
  ownerIds: readonly number[],
  topup: Topup,
  /** Only these chats (e.g. one admin opening the queue); default: every admin. */
  recipients?: number[],
): Promise<void> {
  const caption = await renderAlert(db, topup);
  const sent = [];
  for (const chatId of recipients ?? (await listAdminTelegramIds(db, ownerIds))) {
    try {
      const message = await api.sendPhoto(chatId, topup.receiptFileId, {
        caption,
        parse_mode: 'HTML',
        reply_markup: decisionKeyboard(topup),
      });
      sent.push({ chatId, messageId: message.message_id });
    } catch (error) {
      // An admin who never started the bot cannot be messaged; the others still get it.
      if (!(error instanceof GrammyError)) throw error;
      console.error(`Could not alert admin ${chatId}:`, error.description);
    }
  }
  await recordNotifications(db, { type: ENTITY, id: topup.id }, sent);
}

/** After a decision: tell the customer and turn every admin's copy into a status line. */
export async function announceTopupDecision(
  api: Api,
  db: Db,
  result: DecisionResult & { ok: true },
): Promise<void> {
  const { topup, balance } = result;
  const customer = await getCustomer(db, topup.customerId);
  if (customer) {
    const resume =
      topup.status === 'approved' && (await pendingPurchaseVariant(db, customer.id)) !== undefined;
    const keyboard = new InlineKeyboard();
    if (resume) keyboard.text(texts.buttons.resumePurchase, 'resume').success().row();
    keyboard.text(texts.buttons.home, cb.home);
    const text =
      topup.status === 'approved'
        ? texts.topupApproved(
            topup.id,
            toman(topup.approvedAmountToman ?? 0),
            toman(topup.claimedAmountToman),
            balance,
          )
        : texts.topupRejected(topup.id, topup.rejectReason ?? '');
    await api
      .sendMessage(customer.telegramId, resume ? text + texts.resumePurchaseHint : text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
      .catch((error: unknown) => console.error('Could not notify customer:', error));
  }
  await refreshAlerts(api, db, topup);
}

async function refreshAlerts(api: Api, db: Db, topup: Topup): Promise<void> {
  const caption = await renderAlert(db, topup);
  for (const { chatId, messageId } of await listNotifications(db, { type: ENTITY, id: topup.id })) {
    await api
      .editMessageCaption(chatId, messageId, { caption, parse_mode: 'HTML' })
      .catch((error: unknown) => console.error('Could not update admin alert:', error));
  }
}

/** Handles the decision buttons on admin alerts. */
export function topupAlertComposer(db: Db, ownerIds: readonly number[]): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  const tp = composer.callbackQuery(/^tp:/);
  const isAdmin = async (ctx: BotContext) =>
    ctx.from !== undefined && (await resolveAdmin(db, ownerIds, ctx.from.id)) !== undefined;
  tp.drop(isAdmin, (ctx) => ctx.answerCallbackQuery({ text: texts.notAdmin, show_alert: true }));
  const alerts = tp.filter(isAdmin);

  async function decided(ctx: BotContext, result: DecisionResult) {
    if (result.ok) {
      await ctx.answerCallbackQuery();
      await announceTopupDecision(ctx.api, db, result);
    } else {
      await ctx.answerCallbackQuery({ text: texts.alreadyHandled, show_alert: true });
      if (result.topup) await refreshAlerts(ctx.api, db, result.topup);
    }
  }

  alerts.callbackQuery(/^tp:a:(\d+)$/, async (ctx) =>
    decided(ctx, await approveTopup(db, { topupId: Number(ctx.match[1]), actor: ctx.from.id })),
  );

  alerts.callbackQuery(/^tp:x:(\d+):(\d+)$/, async (ctx) => {
    const reason = topupRejectReasons[Number(ctx.match[2])];
    if (!reason) return ctx.answerCallbackQuery();
    await decided(
      ctx,
      await rejectTopup(db, { topupId: Number(ctx.match[1]), actor: ctx.from.id, reason }),
    );
  });

  alerts.callbackQuery(/^tp:([rb]):(\d+)$/, async (ctx) => {
    const topup = await getTopup(db, Number(ctx.match[2]));
    if (topup?.status !== 'pending') {
      return ctx.answerCallbackQuery({ text: texts.alreadyHandled, show_alert: true });
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({
      reply_markup: ctx.match[1] === 'r' ? rejectKeyboard(topup.id) : decisionKeyboard(topup),
    });
  });

  return composer;
}
