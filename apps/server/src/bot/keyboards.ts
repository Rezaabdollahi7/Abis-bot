import { InlineKeyboard } from 'grammy';
import { texts } from './texts.js';

/** Callback data values. Keep them short: Telegram allows 64 bytes. */
export const cb = {
  home: 'home',
  shop: 'shop',
  topup: 'topup',
  account: 'account',
  support: 'support',
  joinCheck: 'join:check',
} as const;

/** `@name` → `https://t.me/name`; numeric ids have no public link. */
export function channelUrl(channelId: string | undefined): string | undefined {
  return channelId?.startsWith('@') ? `https://t.me/${channelId.slice(1)}` : undefined;
}

export function mainMenu(channelLink: string | undefined): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(texts.buttons.shop, cb.shop)
    .primary()
    .row()
    .text(texts.buttons.topup, cb.topup)
    .success()
    .text(texts.buttons.account, cb.account)
    .row()
    .text(texts.buttons.support, cb.support);
  if (channelLink) keyboard.row().url(texts.buttons.channel, channelLink);
  return keyboard;
}

export function homeOnly(): InlineKeyboard {
  return new InlineKeyboard().text(texts.buttons.home, cb.home);
}

export function joinChannel(channelLink: string): InlineKeyboard {
  return new InlineKeyboard()
    .url(texts.buttons.joinChannel, channelLink)
    .primary()
    .row()
    .text(texts.buttons.joined, cb.joinCheck)
    .success();
}
