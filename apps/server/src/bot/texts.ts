// Every Persian string the bot shows lives here (RULES.md #14).
import { type Toman, formatToman } from '@abis/shared';

/** Working brand name until the final one is chosen. */
export const BRAND = 'Abis';

const jalaliDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long' });

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
  },
} as const;

/** Escapes user-controlled text for parse_mode HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
