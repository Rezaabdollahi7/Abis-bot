import { toman } from '@abis/shared';
import { type Api, GrammyError } from 'grammy';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import { listAdminTelegramIds } from '../modules/admins/index.js';
import { getCustomer } from '../modules/customers/index.js';
import { recordNotifications } from '../modules/notifications/index.js';
import { type PurchaseResult, readCustomerInput } from '../modules/orders/index.js';
import { getSettings } from '../modules/settings/index.js';
import { formatDuration, texts } from './texts.js';

type Purchased = PurchaseResult & { ok: true };

/** Sends `text` to every admin; returns the copies sent. Unreachable admins are skipped. */
export async function broadcastToAdmins(
  api: Api,
  db: Db,
  ownerIds: readonly number[],
  text: string,
): Promise<{ chatId: number; messageId: number }[]> {
  const sent = [];
  for (const chatId of await listAdminTelegramIds(db, ownerIds)) {
    try {
      const message = await api.sendMessage(chatId, text, { parse_mode: 'HTML' });
      sent.push({ chatId, messageId: message.message_id });
    } catch (error) {
      if (!(error instanceof GrammyError)) throw error;
      console.error(`Could not message admin ${chatId}:`, error.description);
    }
  }
  return sent;
}

const productLine = (r: Purchased) =>
  `${r.provider.emoji} ${r.product.name} · ${formatDuration(r.variant.durationDays)}`;

/** A queued order needs a human: tell every admin what to activate and for whom. */
export async function alertAdminsOfQueuedOrder(
  api: Api,
  db: Db,
  ownerIds: readonly number[],
  cipher: Cipher,
  result: Purchased,
): Promise<void> {
  const customer = await getCustomer(db, result.order.customerId);
  const text = texts.orderAlert({
    orderId: result.order.id,
    productLine: productLine(result),
    quantity: result.order.quantity,
    total: toman(result.order.totalToman),
    customerName: customer?.firstName ?? '?',
    username: customer?.username ?? null,
    telegramId: customer?.telegramId ?? 0,
    input: readCustomerInput(cipher, result.order),
    outOfStock: result.stockLeft !== null,
  });
  const sent = await broadcastToAdmins(api, db, ownerIds, text);
  await recordNotifications(db, { type: 'order', id: result.order.id }, sent);
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
      texts.lowStockAlert(productLine(result), result.stockLeft),
    );
  }
}
