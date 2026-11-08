// Every Persian string the bot shows lives here (RULES.md #14).
import { type Toman, formatToman } from '@abis/shared';
import type { DeliveryMethod, VariantView } from '../modules/catalog/index.js';

/** Working brand name until the final one is chosen. */
export const BRAND = 'Abis';

const jalaliDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long' });
const faNumber = new Intl.NumberFormat('fa-IR');

/** 30 → «۱ ماهه», 360 → «۱۲ ماهه», 7 → «۷ روزه». */
export function formatDuration(days: number): string {
  return days % 30 === 0 ? `${faNumber.format(days / 30)} ماهه` : `${faNumber.format(days)} روزه`;
}

const deliveryLabels: Record<DeliveryMethod, string> = {
  link: 'لینک فعال‌سازی',
  ready_account: 'اکانت آماده',
  email_activation: 'فعال‌سازی روی ایمیل شما',
};

function stockLabel(stock: number | null): string {
  if (stock === null) return 'موجود';
  return stock > 0 ? `${faNumber.format(stock)} عدد` : 'ناموجود (تحویل دستی)';
}

function isInstant(view: VariantView): boolean {
  return view.stock !== null && view.stock > 0;
}

export const texts = {
  welcome: (name: string, balance: Toman) =>
    [
      `👋 سلام <b>${escapeHtml(name)}</b>!`,
      '',
      `به فروشگاه <b>${BRAND}</b> خوش آمدید؛ اکانت‌های هوش مصنوعی با تحویل سریع و پشتیبانی واقعی.`,
      '',
      `💰 موجودی کیف پول: <b>${formatToman(balance)}</b>`,
      '',
      'از منوی زیر انتخاب کنید 👇',
    ].join('\n'),

  account: (args: {
    name: string;
    telegramId: number;
    balance: Toman;
    phone: string | null;
    memberSince: Date;
  }) =>
    [
      '👤 <b>حساب من</b>',
      '',
      `نام: ${escapeHtml(args.name)}`,
      `شناسه: <code>${args.telegramId}</code>`,
      `📱 موبایل: ${args.phone ?? 'ثبت نشده'}`,
      `📅 عضویت از: ${jalaliDate.format(args.memberSince)}`,
      '',
      `💰 موجودی: <b>${formatToman(args.balance)}</b>`,
    ].join('\n'),

  shop: (page: number, totalPages: number) =>
    [
      '🛍 <b>فروشگاه</b>',
      '',
      `یک شرکت را انتخاب کنید یا مستقیم از محصولات ویژه خرید کنید — صفحه‌ی ${faNumber.format(page)} از ${faNumber.format(totalPages)}.`,
    ].join('\n'),
  shopEmpty: '🛍 فعلاً محصولی برای فروش موجود نیست. به‌زودی برمی‌گردیم!',
  provider: (emoji: string, name: string) =>
    `${emoji} <b>${escapeHtml(name)}</b>\n\nیک محصول را انتخاب کنید:`,
  product: (name: string) => `<b>${escapeHtml(name)}</b>\n\nمدت اشتراک را انتخاب کنید:`,
  notAvailable: 'این محصول دیگر در دسترس نیست.',

  /** Product card (inspired by the reference bots: one block of facts, then the description). */
  variantCard: (view: VariantView) => {
    const { variant, product, provider } = view;
    const warranty =
      product.warrantyDays > 0 ? `${faNumber.format(product.warrantyDays)} روز` : 'ندارد';
    const delivery = isInstant(view)
      ? '⚡ <i>تحویل خودکار، بلافاصله پس از پرداخت</i>'
      : `⏱ <i>تحویل دستی${product.etaMinutes ? `، حدود ${faNumber.format(product.etaMinutes)} دقیقه` : ''}</i>`;
    return [
      `${provider.emoji} <b>${escapeHtml(product.name)} · ${formatDuration(variant.durationDays)}</b>`,
      '',
      `<blockquote>💰 قیمت: <b>${formatToman(variant.priceToman)}</b>`,
      `📅 مدت: ${formatDuration(variant.durationDays)}`,
      `🛡 گارانتی: ${warranty}`,
      `📦 موجودی: ${stockLabel(view.stock)}`,
      `🔖 نوع تحویل: ${deliveryLabels[product.deliveryMethod]}`,
      `📈 فروش: ${faNumber.format(variant.soldCount)}</blockquote>`,
      ...(product.description ? ['', '📝 <b>توضیحات</b>', product.description] : []),
      '',
      delivery,
    ].join('\n');
  },

  /** Short line for list buttons: «ChatGPT Plus · ۱ ماهه · ۸۰۰٬۰۰۰ تومان (۵)». */
  variantButton: (view: VariantView) => {
    const stock = view.stock === null ? '' : ` (${faNumber.format(view.stock)})`;
    return `${view.provider.emoji} ${view.product.name} · ${formatDuration(view.variant.durationDays)} · ${formatToman(view.variant.priceToman)}${stock}`;
  },
  durationButton: (view: VariantView) =>
    `${formatDuration(view.variant.durationDays)} · ${formatToman(view.variant.priceToman)}`,

  joinRequired: (channelUrl: string) =>
    [
      '📢 برای استفاده از ربات، ابتدا در کانال ما عضو شوید.',
      '',
      channelUrl,
      '',
      'بعد از عضویت، دکمه‌ی «عضو شدم» را بزنید.',
    ].join('\n'),
  notJoinedYet: 'هنوز عضو کانال نشده‌اید ❗️',
  comingSoon: '🛠 این بخش به‌زودی فعال می‌شود.',

  buttons: {
    shop: '🛍 فروشگاه',
    topup: '💳 شارژ کیف پول',
    account: '👤 حساب من',
    support: '🎧 پشتیبانی',
    channel: '📢 کانال ما',
    joinChannel: '📢 عضویت در کانال',
    joined: '✅ عضو شدم',
    home: '🏠 خانه',
    back: '🔙 بازگشت',
    buy: '🛒 خرید',
    refresh: '🔄',
  },
} as const;

/** Escapes user-controlled text for parse_mode HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
