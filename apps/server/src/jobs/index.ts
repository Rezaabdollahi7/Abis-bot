import { type Api, InlineKeyboard } from 'grammy';
import { shopCb } from '../bot/keyboards.js';
import { orderProductLine } from '../bot/order-alerts.js';
import { texts } from '../bot/texts.js';
import type { Db } from '../db/client.js';
import { getCustomer } from '../modules/customers/index.js';
import { claimDueReminders, purgeExpiredInput } from '../modules/orders/index.js';

/** Sends the 3-day expiry reminder with a renew button. Returns how many were sent. */
export async function sendExpiryReminders(api: Api, db: Db, now = new Date()): Promise<number> {
  let sent = 0;
  for (const { subscription, order } of await claimDueReminders(db, now)) {
    const customer = await getCustomer(db, order.customerId);
    if (!customer || customer.isBanned) continue;
    const line = await orderProductLine(db, order);
    await api
      .sendMessage(customer.telegramId, texts.expiryReminder(line, subscription.expiresAt), {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text(texts.buttons.renew, shopCb.variant(order.variantId))
          .success(),
      })
      .then(() => sent++)
      .catch((error: unknown) => console.error('Could not send reminder:', error));
  }
  return sent;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Runs the periodic jobs now and then hourly, in this process.
 * A single server instance is enough for this shop; if it ever runs on several,
 * the jobs stay safe because each claims its rows with a guarded UPDATE.
 */
export function startJobs(api: Api, db: Db): () => void {
  const run = async () => {
    try {
      const reminders = await sendExpiryReminders(api, db);
      const purged = await purgeExpiredInput(db);
      if (reminders || purged) console.log(`Jobs: ${reminders} reminders, ${purged} inputs purged`);
    } catch (error) {
      console.error('Job run failed:', error);
    }
  };
  void run();
  const timer = setInterval(() => void run(), HOUR_MS);
  return () => clearInterval(timer);
}
