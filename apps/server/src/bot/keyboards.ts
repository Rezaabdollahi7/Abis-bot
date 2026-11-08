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

// ── Shop ──────────────────────────────────────────────────────────────────────

export const shopCb = {
  page: (page: number) => `shop:${page}`,
  provider: (id: number) => `prov:${id}`,
  product: (id: number) => `prod:${id}`,
  variant: (id: number) => `var:${id}`,
  buy: (id: number) => `buy:${id}`,
} as const;

export const shopCbPattern = {
  page: /^shop:(\d+)$/,
  provider: /^prov:(\d+)$/,
  product: /^prod:(\d+)$/,
  variant: /^var:(\d+)$/,
  buy: /^buy:(\d+)$/,
} as const;

const PROVIDER_COLUMNS = 3;

export function shopKeyboard(args: {
  providers: { id: number; name: string; emoji: string }[];
  featured: { id: number; label: string }[];
  page: number;
  totalPages: number;
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  args.providers.forEach((provider, index) => {
    if (index > 0 && index % PROVIDER_COLUMNS === 0) keyboard.row();
    keyboard.text(`${provider.emoji} ${provider.name}`, shopCb.provider(provider.id));
  });
  for (const item of args.featured) keyboard.row().text(item.label, shopCb.variant(item.id));

  keyboard.row();
  if (args.page > 1) keyboard.text('→', shopCb.page(args.page - 1));
  keyboard.text(texts.buttons.refresh, shopCb.page(args.page));
  if (args.page < args.totalPages) keyboard.text('←', shopCb.page(args.page + 1));
  return keyboard.row().text(texts.buttons.home, cb.home).danger();
}

export function listKeyboard(
  items: { label: string; data: string }[],
  backData: string,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const item of items) keyboard.text(item.label, item.data).row();
  return keyboard.text(texts.buttons.back, backData).text(texts.buttons.home, cb.home);
}

export function variantKeyboard(variantId: number, productId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(texts.buttons.buy, shopCb.buy(variantId))
    .success()
    .row()
    .text(texts.buttons.back, shopCb.product(productId))
    .text(texts.buttons.home, cb.home);
}
