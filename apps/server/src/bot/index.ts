import { Bot, type BotConfig, GrammyError } from 'grammy';
import type { Db } from '../db/client.js';
import type { Config } from '../lib/config.js';
import { registerCustomer } from '../modules/customers/index.js';
import { getSettings } from '../modules/settings/index.js';
import { getBalance } from '../modules/wallet/index.js';
import type { BotContext } from './context.js';
import { cb, channelUrl, homeOnly, joinChannel, mainMenu } from './keyboards.js';
import { shopComposer } from './shop.js';
import { texts } from './texts.js';

export interface BotDeps {
  db: Db;
  config: Pick<Config, 'BOT_TOKEN' | 'CHANNEL_ID'>;
  /** Tests inject botInfo so the bot never calls getMe. */
  botConfig?: BotConfig<BotContext>;
}

const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member']);

export function createBot({ db, config, botConfig }: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.BOT_TOKEN, botConfig);
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
    await ctx.reply(await homeText(ctx), {
      parse_mode: 'HTML',
      reply_markup: mainMenu(channelLink),
    });
  });

  pm.callbackQuery([cb.home, cb.joinCheck], async (ctx) => {
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
      }),
      { parse_mode: 'HTML', reply_markup: homeOnly() },
    );
  });

  pm.use(shopComposer(db));

  // Placeholders until their roadmap items land.
  pm.callbackQuery([cb.topup, cb.support], (ctx) =>
    ctx.answerCallbackQuery({ text: texts.comingSoon, show_alert: true }),
  );

  bot.catch((err) => {
    console.error(`Error while handling update ${err.ctx.update.update_id}:`, err.error);
  });

  return bot;
}

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
