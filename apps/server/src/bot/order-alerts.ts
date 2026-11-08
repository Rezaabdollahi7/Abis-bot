import { type Toman, toman } from '@abis/shared';
import { type Api, GrammyError, InlineKeyboard } from 'grammy';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import { listAdminTelegramIds } from '../modules/admins/index.js';
import { getVariantWithProduct } from '../modules/catalog/index.js';
import { getCustomer, namesByTelegramId } from '../modules/customers/index.js';
import { listNotifications, recordNotifications } from '../modules/notifications/index.js';
import {
  type Order,
  type PurchaseResult,
  readCustomerInput,
  readDeliveryNote,
} from '../modules/orders/index.js';
import { getSettings } from '../modules/settings/index.js';
import { cb } from './keyboards.js';
import { escapeHtml, formatDuration, texts } from './texts.js';

type Purchased = PurchaseResult & { ok: true };
const ENTITY = 'order';

/** Sends `text` to every admin; returns the copies sent. Unreachable admins are skipped. */
export async function broadcastToAdmins(
  api: Api,
  db: Db,
  ownerIds: readonly number[],
  text: string,
  keyboard?: InlineKeyboard,
): Promise<{ chatId: number; messageId: number }[]> {
  const sent = [];
  for (const chatId of await listAdminTelegramIds(db, ownerIds)) {
    try {
      const message = await api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...(keyboard ? { reply_markup: keyboard } : {}),
      });
      sent.push({ chatId, messageId: message.message_id });
    } catch (error) {
      if (!(error instanceof GrammyError)) throw error;
      console.error(`Could not message admin ${chatId}:`, error.description);
    }
  }
  return sent;
}

/** "🟢 ChatGPT Plus · ۱ ماهه" for an order's variant. */
export async function orderProductLine(db: Db, order: Order): Promise<string> {
  const found = await getVariantWithProduct(db, order.variantId);
  return found
    ? `${found.provider.emoji} ${found.product.name} · ${formatDuration(found.variant.durationDays)}`
    : `#${order.variantId}`;
}

async function renderOrderAlert(db: Db, cipher: Cipher, order: Order): Promise<string> {
  const [customer, line, names] = await Promise.all([
    getCustomer(db, order.customerId),
    orderProductLine(db, order),
    namesByTelegramId(db, order.handledByTelegramId ? [order.handledByTelegramId] : []),
  ]);
  const admin = order.handledByTelegramId
    ? escapeHtml(names.get(order.handledByTelegramId) ?? String(order.handledByTelegramId))
    : '';
  const status =
    order.status === 'delivered'
      ? `✅ <b>تحویل شد</b> توسط ${admin}`
      : order.status === 'rejected'
        ? `❌ <b>رد شد</b> توسط ${admin} — ${escapeHtml(order.rejectReason ?? '')} (مبلغ برگشت داده شد)`
        : null;
  const body = texts.orderAlert({
    orderId: order.id,
    productLine: line,
    quantity: order.quantity,
    total: toman(order.totalToman),
    customerName: customer?.firstName ?? '?',
    username: customer?.username ?? null,
    telegramId: customer?.telegramId ?? 0,
    input: readCustomerInput(cipher, order),
    outOfStock: order.customerInputEncrypted === null,
  });
  return status ? `${body}\n\n${status}` : body;
}

export const orderAlertCb = {
  deliver: (id: number) => `od:d:${id}`,
  rejectMenu: (id: number) => `od:r:${id}`,
  reject: (id: number, reason: number) => `od:x:${id}:${reason}`,
  back: (id: number) => `od:b:${id}`,
  password: (id: number) => `od:p:${id}`,
};

export function orderAlertKeyboard(orderId: number, hasPassword: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(texts.buttons.deliver, orderAlertCb.deliver(orderId))
    .success()
    .text(texts.buttons.rejectRefund, orderAlertCb.rejectMenu(orderId))
    .danger();
  if (hasPassword) keyboard.row().text(texts.buttons.showPassword, orderAlertCb.password(orderId));
  return keyboard;
}

/** A queued order needs a human: tell every admin what to activate and for whom. */
export async function alertAdminsOfQueuedOrder(
  api: Api,
  db: Db,
  ownerIds: readonly number[],
  cipher: Cipher,
  result: Purchased,
): Promise<void> {
  const sent = await broadcastToAdmins(
    api,
    db,
    ownerIds,
    await renderOrderAlert(db, cipher, result.order),
    orderAlertKeyboard(
      result.order.id,
      readCustomerInput(cipher, result.order).password !== undefined,
    ),
  );
  await recordNotifications(db, { type: ENTITY, id: result.order.id }, sent);
}

/** After manual delivery or rejection: tell the customer and update every admin's alert. */
export async function announceOrderDecision(
  api: Api,
  db: Db,
  cipher: Cipher,
  order: Order,
  balance?: Toman,
): Promise<void> {
  const customer = await getCustomer(db, order.customerId);
  const line = await orderProductLine(db, order);
  if (customer) {
    const text =
      order.status === 'delivered'
        ? texts.orderDeliveredManually(order.id, line, readDeliveryNote(cipher, order) ?? '')
        : texts.orderRejected(
            order.id,
            line,
            order.rejectReason ?? '',
            toman(order.totalToman),
            balance,
          );
    await api
      .sendMessage(customer.telegramId, text, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text(texts.buttons.home, cb.home),
      })
      .catch((error: unknown) => console.error('Could not notify customer:', error));
  }
  const alert = await renderOrderAlert(db, cipher, order);
  for (const { chatId, messageId } of await listNotifications(db, { type: ENTITY, id: order.id })) {
    await api
      .editMessageText(chatId, messageId, alert, { parse_mode: 'HTML' })
      .catch((error: unknown) => console.error('Could not update admin alert:', error));
  }
}

/** Alerts once, when a sale takes stock from above the threshold to at or below it. */
export async function alertIfLowStock(
  api: Api,
  db: Db,
  ownerIds: readonly number[],
  result: Purchased,
): Promise<void> {
  if (result.stockLeft === null || result.order.status !== 'delivered') return;
  const { lowStockThreshold } = await getSettings(db);
  const before = result.stockLeft + result.order.quantity;
  if (result.stockLeft <= lowStockThreshold && before > lowStockThreshold) {
    await broadcastToAdmins(
      api,
      db,
      ownerIds,
      texts.lowStockAlert(await orderProductLine(db, result.order), result.stockLeft),
    );
  }
}
