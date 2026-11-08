// Every Persian string the bot shows lives here (RULES.md #14).
import { type LedgerKind, type Toman, formatToman, toman } from '@abis/shared';
import type { DeliveryMethod, VariantView } from '../modules/catalog/index.js';

/** Working brand name until the final one is chosen. */
export const BRAND = 'Abis';

const jalaliDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long' });
const faNumber = new Intl.NumberFormat('fa-IR');
const shortDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short', day: 'numeric' });

const ledgerKindLabels: Record<LedgerKind, string> = {
  topup: 'شارژ',
  purchase: 'خرید',
  refund: 'بازپرداخت',
  adjustment: 'اصلاحیه',
};

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
    recent: { amountToman: number; kind: LedgerKind; createdAt: Date }[];
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
      ...(args.recent.length > 0
        ? [
            '',
            '🧾 <b>تراکنش‌های اخیر</b>',
            ...args.recent.map(
              (e) =>
                `${e.amountToman > 0 ? '➕' : '➖'} ${formatToman(toman(Math.abs(e.amountToman)))} · ${ledgerKindLabels[e.kind]} · ${shortDate.format(e.createdAt)}`,
            ),
          ]
        : []),
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

  // ── Top-up (customer) ──
  topupUnavailable: '💳 شارژ کیف پول موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.',
  askPhone:
    '📱 برای اولین شارژ، لطفاً شماره موبایل خود را با دکمه‌ی زیر ارسال کنید.\n(این شماره فقط برای پیگیری واریزها استفاده می‌شود.)',
  phoneNotYours: 'لطفاً شماره‌ی خودتان را با دکمه‌ی «ارسال شماره» بفرستید.',
  phoneSaved: '✅ شماره‌ی شما ثبت شد.',
  askAmount: (min: Toman, max: Toman) =>
    [
      '💳 <b>شارژ کیف پول</b>',
      '',
      `مبلغ شارژ را به <b>تومان</b> بنویسید (از ${formatToman(min)} تا ${formatToman(max)})، یا یکی از گزینه‌ها را انتخاب کنید:`,
    ].join('\n'),
  amountInvalid: (min: Toman, max: Toman) =>
    `❗️ مبلغ باید عددی بین ${formatToman(min)} و ${formatToman(max)} باشد. دوباره بنویسید:`,
  payToCard: (amount: Toman, card: { number: string; holderName: string; bankName: string }) =>
    [
      `💳 لطفاً مبلغ <b>${formatToman(amount)}</b> را به کارت زیر واریز کنید:`,
      '',
      `<code>${card.number.replace(/(\d{4})(?=\d)/g, '$1-')}</code>`,
      `به نام: <b>${escapeHtml(card.holderName)}</b> — بانک ${escapeHtml(card.bankName)}`,
      '',
      '📸 سپس <b>اسکرین‌شات رسید</b> را همین‌جا بفرستید.',
    ].join('\n'),
  receiptExpected: '📸 لطفاً تصویر رسید واریز را بفرستید، یا «انصراف» را بزنید.',
  receiptSaved: (topupId: number) =>
    `✅ رسید شما ثبت شد (درخواست #${faNumber.format(topupId)}).\nپس از بررسی توسط پشتیبانی، نتیجه همین‌جا اعلام می‌شود.`,
  topupApproved: (topupId: number, amount: Toman, claimed: Toman, balance: Toman) =>
    [
      `✅ شارژ #${faNumber.format(topupId)} تأیید شد.`,
      `💰 مبلغ ${formatToman(amount)} به کیف پول شما اضافه شد.`,
      ...(amount !== claimed
        ? [`(مبلغ اعلام‌شده ${formatToman(claimed)} بود و بر اساس واریز واقعی اصلاح شد.)`]
        : []),
      '',
      `موجودی فعلی: <b>${formatToman(balance)}</b>`,
    ].join('\n'),
  topupRejected: (topupId: number, reason: string) =>
    [
      `❌ درخواست شارژ #${faNumber.format(topupId)} تأیید نشد.`,
      `دلیل: ${escapeHtml(reason)}`,
      '',
      'اگر فکر می‌کنید اشتباهی رخ داده، از بخش پشتیبانی پیام بدهید.',
    ].join('\n'),
  cancelled: 'لغو شد.',
  adjusted: (amount: Toman, reason: string, balance: Toman) =>
    [
      amount > 0
        ? `💰 مبلغ ${formatToman(amount)} به کیف پول شما اضافه شد.`
        : `💸 مبلغ ${formatToman(toman(-amount))} از کیف پول شما کسر شد.`,
      `توضیح: ${escapeHtml(reason)}`,
      '',
      `موجودی فعلی: <b>${formatToman(balance)}</b>`,
    ].join('\n'),

  // ── Top-up (admin alert) ──
  topupAlert: (args: {
    topupId: number;
    customerName: string;
    username: string | null;
    telegramId: number;
    phone: string | null;
    amount: Toman;
    cardLabel: string;
    duplicateOf: number | null;
    status: string | null;
  }) =>
    [
      `💳 <b>درخواست شارژ #${faNumber.format(args.topupId)}</b>`,
      '',
      `👤 ${escapeHtml(args.customerName)}${args.username ? ` (@${escapeHtml(args.username)})` : ''} — <code>${args.telegramId}</code>`,
      `📱 ${args.phone ?? 'شماره ثبت نشده'}`,
      `💰 مبلغ اعلامی: <b>${formatToman(args.amount)}</b>`,
      `🏦 کارت مقصد: ${escapeHtml(args.cardLabel)}`,
      ...(args.duplicateOf
        ? [
            '',
            `⚠️ <b>این تصویر قبلاً در درخواست #${faNumber.format(args.duplicateOf)} ارسال شده است!</b>`,
          ]
        : []),
      ...(args.status ? ['', args.status] : []),
    ].join('\n'),
  topupStatusApproved: (admin: string, amount: Toman) =>
    `✅ <b>تأیید شد</b> توسط ${escapeHtml(admin)} — ${formatToman(amount)}`,
  topupStatusRejected: (admin: string, reason: string) =>
    `❌ <b>رد شد</b> توسط ${escapeHtml(admin)} — ${escapeHtml(reason)}`,
  alreadyHandled: 'این درخواست قبلاً بررسی شده است.',
  notAdmin: 'شما دسترسی ادمین ندارید.',

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
    sendPhone: '📱 ارسال شماره',
    cancel: '❌ انصراف',
    approve: (amount: Toman) => `✅ تأیید ${formatToman(amount)}`,
    reject: '❌ رد',
    amount: (amount: Toman) => formatToman(amount),
  },
} as const;

export { topupRejectReasons } from '@abis/shared';

/** Escapes user-controlled text for parse_mode HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
