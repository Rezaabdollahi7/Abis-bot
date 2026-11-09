import {
  Bot,
  type BotConfig,
  GrammyError,
  InlineKeyboard,
  type Transformer,
  session,
} from 'grammy';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import type { Config } from '../lib/config.js';
import { registerCustomer } from '../modules/customers/index.js';
import { listActiveSubscriptions } from '../modules/orders/index.js';
import { getSettings } from '../modules/settings/index.js';
import { getBalance, listLedger } from '../modules/wallet/index.js';
import { adminMenuComposer } from './admin-menu.js';
import { adminOpsComposer } from './admin-ops.js';
import type { BotContext } from './context.js';
import { cb, channelUrl, homeOnly, joinChannel, mainMenu } from './keyboards.js';
import { sessionStorage } from './session.js';
import { purchaseComposer } from './purchase.js';
import { orderProductLine } from './order-alerts.js';
import { shopComposer } from './shop.js';
import { supportComposer } from './support.js';
import { texts } from './texts.js';
import { topupAlertComposer } from './topup-alerts.js';
import { topupComposer } from './topup.js';

export interface BotDeps {
  db: Db;
  cipher: Cipher;
  config: Pick<Config, 'BOT_TOKEN' | 'CHANNEL_ID' | 'OWNER_TELEGRAM_IDS'> & {
    PUBLIC_URL?: string | undefined;
  };
  /** Tests inject botInfo so the bot never calls getMe. */
  botConfig?: BotConfig<BotContext>;
}

const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member']);

export function createBot({ db, cipher, config, botConfig }: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.BOT_TOKEN, botConfig);

  // A button press handled late (after a restart or a slow moment) can no longer be
  // acknowledged. That must not abort the handler: the action itself still has to run.
  bot.api.config.use(ignoreExpiredCallbackAnswers);
  const channelLink = channelUrl(config.CHANNEL_ID);
  const pm = bot.chatType('private');

  // 1. Every private update with a sender gets a registered customer.
  pm.use(async (ctx, next) => {
    ctx.customer = await registerCustomer(db, {
      telegramId: ctx.from.id,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      username: ctx.from.username,
    });
    await next();
  });

  pm.use(
    session({
      initial: () => ({}),
      storage: sessionStorage(db),
      getSessionKey: (ctx) => ctx.from?.id.toString(),
    }),
  );

  // Admin alert buttons and chat admin work regardless of forced join.
  pm.use(topupAlertComposer(db, config.OWNER_TELEGRAM_IDS));
  pm.use(adminOpsComposer(db, cipher, config.OWNER_TELEGRAM_IDS));
  pm.use(adminMenuComposer(db, cipher, config.OWNER_TELEGRAM_IDS, config.PUBLIC_URL));

  // Banned customers keep their wallet and can still reach support, nothing else.
  pm.use(async (ctx, next) => {
    if (!ctx.customer.isBanned) return next();
    const data = ctx.callbackQuery?.data ?? '';
    const step = ctx.session.step;
    const supportOnly =
      data === cb.support ||
      data.startsWith('tk:') ||
      ((step === 'ticket_new' || step === 'ticket_reply') && !ctx.message?.text?.startsWith('/'));
    if (supportOnly) return next();
    const keyboard = new InlineKeyboard().text(texts.buttons.contactSupport, cb.support);
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: texts.banned, show_alert: true });
    } else {
      ctx.session = {};
      await ctx.reply(texts.banned, { reply_markup: keyboard });
    }
  });

  // 2. Forced join gate (setting can be toggled from the panel).
  pm.use(async (ctx, next) => {
    const { forcedJoin } = await getSettings(db);
    if (!forcedJoin || !config.CHANNEL_ID || !channelLink) return next();
    if (await isChannelMember(ctx, config.CHANNEL_ID)) return next();

    if (ctx.callbackQuery?.data === cb.joinCheck) {
      await ctx.answerCallbackQuery({ text: texts.notJoinedYet, show_alert: true });
      return;
    }
    await ctx.reply(texts.joinRequired(channelLink), { reply_markup: joinChannel(channelLink) });
  });

  async function homeText(ctx: BotContext): Promise<string> {
    return texts.welcome(ctx.customer.firstName, await getBalance(db, ctx.customer.id));
  }

  pm.command('start', async (ctx) => {
    ctx.session = {};
    await ctx.reply(await homeText(ctx), {
      parse_mode: 'HTML',
      reply_markup: mainMenu(channelLink),
    });
  });

  pm.callbackQuery([cb.home, cb.joinCheck], async (ctx) => {
    ctx.session = {};
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(await homeText(ctx), {
      parse_mode: 'HTML',
      reply_markup: mainMenu(channelLink),
    });
  });

  pm.callbackQuery(cb.account, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { customer } = ctx;
    await ctx.editMessageText(
      texts.account({
        name: customer.firstName,
        telegramId: customer.telegramId,
        balance: await getBalance(db, customer.id),
        phone: customer.phone,
        memberSince: customer.createdAt,
        recent: await listLedger(db, customer.id, 5),
        subscriptions: await Promise.all(
          (await listActiveSubscriptions(db, customer.id)).map(async ({ order, subscription }) => ({
            line: await orderProductLine(db, order),
            expiresAt: subscription.expiresAt,
          })),
        ),
      }),
      { parse_mode: 'HTML', reply_markup: homeOnly() },
    );
  });

  pm.use(shopComposer(db));
  pm.use(purchaseComposer(db, cipher, config.OWNER_TELEGRAM_IDS));
  pm.use(topupComposer(db, config.OWNER_TELEGRAM_IDS));
  pm.use(supportComposer(db, config.OWNER_TELEGRAM_IDS));

  // Anything no handler took: say so, and show the way back, so the bot never looks dead.
  pm.on('message', async (ctx) => {
    await ctx.reply(texts.fallback, { reply_markup: mainMenu(channelLink) });
  });

  bot.catch((err) => {
    console.error(`Error while handling update ${err.ctx.update.update_id}:`, err.error);
  });

  return bot;
}

/** API transformer: an expired `answerCallbackQuery` counts as success instead of throwing. */
export const ignoreExpiredCallbackAnswers: Transformer = async (prev, method, payload, signal) => {
  const response = await prev(method, payload, signal);
  const expired =
    !response.ok &&
    (response.description.includes('query is too old') ||
      response.description.includes('query ID is invalid'));
  if (method === 'answerCallbackQuery' && expired) return { ok: true, result: true as never };
  return response;
};

async function isChannelMember(ctx: BotContext, channelId: string): Promise<boolean> {
  if (!ctx.from) return false;
  try {
    const member = await ctx.api.getChatMember(channelId, ctx.from.id);
    return (
      MEMBER_STATUSES.has(member.status) || (member.status === 'restricted' && member.is_member)
    );
  } catch (error) {
    // Misconfiguration (bot not admin of the channel) must not lock every customer out.
    if (error instanceof GrammyError) {
      console.error('Forced join check failed; letting the user through:', error.description);
      return true;
    }
    throw error;
  }
}
