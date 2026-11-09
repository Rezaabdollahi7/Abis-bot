// Every Persian string the bot shows lives here (RULES.md #14).
import { type LedgerKind, type Toman, formatToman, toman } from '@abis/shared';
import type { RequiredFieldName } from '@abis/shared';
import type { DeliveryMethod, VariantView } from '../modules/catalog/index.js';

/** Working brand name until the final one is chosen. */
export const BRAND = 'Abis';

const jalaliDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long' });
const faNumber = new Intl.NumberFormat('fa-IR');
const shortDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short', day: 'numeric' });

type OrderStatusName = 'queued' | 'delivered' | 'rejected';
const orderStatusIcons: Record<OrderStatusName, string> = {
  queued: '⏳',
  delivered: '✅',
  rejected: '↩️',
};
const orderStatusLabels: Record<OrderStatusName, string> = {
  queued: 'در صف تحویل',
  delivered: 'تحویل شده',
  rejected: 'انجام نشد — برگشت خورده',
};

type TicketTopicName = 'order' | 'payment' | 'general';
type TicketStatusName = 'awaiting_admin' | 'awaiting_customer' | 'closed';
export const ticketTopicLabels: Record<TicketTopicName, string> = {
  order: '📦 سفارش',
  payment: '💳 پرداخت',
  general: '💬 سؤال عمومی',
};

const ledgerKindLabels: Record<LedgerKind, string> = {
  topup: 'شارژ',
  purchase: 'خرید',
  refund: 'برگشت خورده',
  adjustment: 'اصلاحیه',
};

/** 30 → «۱ ماهه», 360 → «۱۲ ماهه», 7 → «۷ روزه». */
const monthWords: Record<number, string> = {
  1: 'یک ماهه',
  2: 'دو ماهه',
  3: 'سه ماهه',
  4: 'چهار ماهه',
  6: 'شش ماهه',
  12: 'یک ساله',
};

/** 30 → «یک ماهه», 90 → «سه ماهه», 360 → «یک ساله»; unusual lengths in digits. */
export function formatDuration(days: number): string {
  if (days % 30 !== 0) return `${faNumber.format(days)} روزه`;
  const months = days / 30;
  return monthWords[months] ?? `${faNumber.format(months)} ماهه`;
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
    subscriptions: { line: string; expiresAt: Date }[];
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
      ...(args.subscriptions.length > 0
        ? [
            '',
            '📦 <b>اشتراک‌های فعال</b>',
            ...args.subscriptions.map(
              (s) => `• ${escapeHtml(s.line)} — تا ${shortDate.format(s.expiresAt)}`,
            ),
          ]
        : []),
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

  // ── Purchase ──
  chooseQuantity: (name: string, stock: number) =>
    `🛒 <b>${escapeHtml(name)}</b>\n\nچند عدد می‌خواهید؟ (موجودی: ${faNumber.format(stock)})`,
  askQuantity: (max: number) => `🔢 تعداد را به عدد بفرستید (حداکثر ${faNumber.format(max)}):`,
  badQuantity: (max: number) => `❗️ لطفاً عددی بین ۱ و ${faNumber.format(max)} بفرستید:`,
  askField: {
    email: '📧 ایمیل اکانتی که اشتراک باید روی آن فعال شود را بفرستید:',
    password:
      '🔑 برای فعال‌سازی این اشتراک، کارشناس ما باید یک بار وارد اکانت شما شود. لطفاً رمز عبور همان اکانت را بفرستید.\n\n🔒 رمز شما رمزنگاری‌شده نگهداری می‌شود، فقط برای همین فعال‌سازی استفاده می‌شود و ۷ روز پس از تحویل به‌طور کامل حذف می‌شود. پیشنهاد می‌کنیم پس از تحویل، رمز اکانت خود را تغییر دهید.',
    note: '📝 اگر توضیحی برای فعال‌سازی دارید بنویسید (وگرنه «-» بفرستید):',
  } satisfies Record<RequiredFieldName, string>,
  invalidField: {
    email: '❗️ ایمیل معتبر نیست. دوباره بفرستید:',
    password: '❗️ رمز نمی‌تواند خالی باشد. دوباره بفرستید:',
    note: '❗️ لطفاً یک توضیح یا «-» بفرستید:',
  } satisfies Record<RequiredFieldName, string>,
  confirmOrder: (args: {
    view: VariantView;
    quantity: number;
    total: Toman;
    balance: Toman;
    values: Partial<Record<RequiredFieldName, string>>;
  }) => {
    const { view, quantity, total, balance, values } = args;
    const lines = [
      '🧾 <b>پیش‌فاکتور</b>',
      '',
      `${view.provider.emoji} ${escapeHtml(view.product.name)} · ${formatDuration(view.variant.durationDays)}`,
      `تعداد: ${faNumber.format(quantity)}`,
      `مبلغ: <b>${formatToman(total)}</b>`,
    ];
    if (values.email) lines.push(`📧 ایمیل: <code>${escapeHtml(values.email)}</code>`);
    if (values.password) lines.push('🔑 رمز: ••••••');
    if (values.note && values.note !== '-') lines.push(`📝 توضیح: ${escapeHtml(values.note)}`);
    lines.push('', `💰 موجودی کیف پول: ${formatToman(balance)}`);
    if (balance < total) {
      lines.push(
        '',
        `❗️ موجودی کافی نیست. <b>${formatToman(toman(total - balance))}</b> کم دارید.`,
      );
    }
    return lines.join('\n');
  },
  orderDelivered: (orderId: number, name: string, balance: Toman) =>
    [
      `✅ <b>سفارش #${faNumber.format(orderId)} تحویل شد</b> — ${escapeHtml(name)}`,
      '',
      'اطلاعات اکانت در پیام بعدی است. آن را در جای امنی نگه دارید.',
      '',
      `موجودی فعلی: ${formatToman(balance)}`,
    ].join('\n'),
  deliveredItems: (items: string[]) =>
    items
      .map(
        (item, i) =>
          `${items.length > 1 ? `<b>${faNumber.format(i + 1)})</b>\n` : ''}<pre>${escapeHtml(item)}</pre>`,
      )
      .join('\n'),
  orderQueued: (orderId: number, name: string, etaMinutes: number | null, balance: Toman) =>
    [
      `✅ <b>سفارش #${faNumber.format(orderId)} ثبت شد</b> — ${escapeHtml(name)}`,
      '',
      `⏱ در صف تحویل است${etaMinutes ? ` و حدود ${faNumber.format(etaMinutes)} دقیقه‌ی دیگر انجام می‌شود` : ''}. نتیجه همین‌جا اطلاع داده می‌شود.`,
      '',
      `موجودی فعلی: ${formatToman(balance)}`,
    ].join('\n'),
  orderDeliveredManually: (orderId: number, line: string, note: string) =>
    [
      `✅ <b>سفارش #${faNumber.format(orderId)} تحویل شد</b>`,
      escapeHtml(line),
      ...(note ? ['', '<b>پیام ادمین:</b>', escapeHtml(note)] : []),
    ].join('\n'),
  orderRejected: (orderId: number, line: string, reason: string, refund: Toman, balance?: Toman) =>
    [
      `❌ <b>سفارش #${faNumber.format(orderId)} انجام نشد</b>`,
      escapeHtml(line),
      `دلیل: ${escapeHtml(reason)}`,
      '',
      `💰 مبلغ ${formatToman(refund)} به کیف پول شما برگشت داده شد.`,
      ...(balance === undefined ? [] : [`موجودی فعلی: ${formatToman(balance)}`]),
    ].join('\n'),
  expiryReminder: (line: string, expiresAt: Date) =>
    [
      '⏰ <b>یادآوری تمدید</b>',
      '',
      `اشتراک ${escapeHtml(line)} شما ${shortDate.format(expiresAt)} به پایان می‌رسد.`,
      'برای جلوگیری از قطع شدن، همین حالا تمدید کنید 👇',
    ].join('\n'),
  warrantyRefunded: (orderId: number, amount: Toman, reason: string, balance: Toman) =>
    [
      `🛡 <b>گارانتی سفارش #${faNumber.format(orderId)}</b>`,
      `دلیل: ${escapeHtml(reason)}`,
      '',
      `💰 مبلغ ${formatToman(amount)} به کیف پول شما برگشت داده شد.`,
      `موجودی فعلی: ${formatToman(balance)}`,
    ].join('\n'),
  notEnoughStock: (available: number) =>
    `فقط ${faNumber.format(available)} عدد موجود است. لطفاً تعداد کمتری انتخاب کنید.`,
  confirmExpired: 'این پیش‌فاکتور منقضی شده است. لطفاً دوباره از فروشگاه انتخاب کنید.',
  alreadyOrdered: 'این سفارش قبلاً ثبت شده است.',

  // ── Order alerts (admin) ──
  orderAlert: (args: {
    orderId: number;
    productLine: string;
    quantity: number;
    total: Toman;
    customerName: string;
    username: string | null;
    telegramId: number;
    input: Partial<Record<RequiredFieldName, string>>;
    outOfStock: boolean;
  }) =>
    [
      `🛒 <b>سفارش #${faNumber.format(args.orderId)} — نیاز به تحویل دستی</b>`,
      ...(args.outOfStock ? ['⚠️ <i>انبار خالی بود</i>'] : []),
      '',
      `${escapeHtml(args.productLine)} × ${faNumber.format(args.quantity)}`,
      `💰 ${formatToman(args.total)}`,
      `👤 ${escapeHtml(args.customerName)}${args.username ? ` (@${escapeHtml(args.username)})` : ''} — <code>${args.telegramId}</code>`,
      ...(args.input.email ? [`📧 <code>${escapeHtml(args.input.email)}</code>`] : []),
      ...(args.input.password ? ['🔑 رمز در پنل قابل مشاهده است'] : []),
      ...(args.input.note && args.input.note !== '-' ? [`📝 ${escapeHtml(args.input.note)}`] : []),
    ].join('\n'),
  askDeliveryNote: (orderId: number) =>
    `📦 پیام تحویل سفارش #${faNumber.format(orderId)} را بفرستید (لینک، مشخصات اکانت یا توضیح فعال‌سازی).\nهمین پیام عیناً برای مشتری ارسال می‌شود. برای لغو /cancel`,
  orderDeliveredByYou: (orderId: number) =>
    `✅ سفارش #${faNumber.format(orderId)} تحویل شد و به مشتری ارسال شد.`,
  orderAlreadyHandled: 'این سفارش قبلاً بررسی شده است.',
  passwordPopup: (password: string) => `🔑 رمز مشتری:\n${password}`,
  passwordGone: 'رمز موجود نیست (پاک شده یا وارد نشده).',
  ticketReplySent: (ticketId: number) =>
    `✅ پاسخ برای مشتری (تیکت #${faNumber.format(ticketId)}) ارسال شد.`,
  adminCancelled: 'لغو شد.',
  saleAlert: (args: {
    orderId: number;
    productLine: string;
    quantity: number;
    total: Toman;
    customerName: string;
    username: string | null;
  }) =>
    `🛍 <b>فروش جدید</b> #${faNumber.format(args.orderId)}\n${escapeHtml(args.customerName)}${args.username ? ` (@${escapeHtml(args.username)})` : ''} خرید: ${escapeHtml(args.productLine)}${args.quantity > 1 ? ` × ${faNumber.format(args.quantity)}` : ''}\n💰 ${formatToman(args.total)} · ⚡ تحویل خودکار`,
  ticketClosedBySupport: (id: number) =>
    `🔒 تیکت #${faNumber.format(id)} توسط پشتیبانی بسته شد. اگر سؤال دیگری دارید، از بخش پشتیبانی تیکت جدید بزنید یا به همین تیکت پاسخ دهید.`,
  fallback:
    '🤔 متوجه پیام شما نشدم. لطفاً از دکمه‌های زیر استفاده کنید. اگر سؤالی دارید، از بخش «🎧 پشتیبانی» تیکت بزنید.',
  lowStockAlert: (productLine: string, left: number) =>
    `⚠️ <b>موجودی رو به اتمام</b>\n${escapeHtml(productLine)}\nباقی‌مانده: ${faNumber.format(left)}`,

  // ── Support ──
  supportHome: (count: number) =>
    count > 0
      ? '🎧 <b>پشتیبانی</b>\n\nتیکت‌های باز شما در زیر هستند. برای مشاهده یا پاسخ، روی هر کدام بزنید:'
      : '🎧 <b>پشتیبانی</b>\n\nسؤال یا مشکلی دارید؟ یک تیکت جدید باز کنید؛ پاسخ همین‌جا برایتان ارسال می‌شود.',
  ticketButton: (id: number, topic: TicketTopicName, status: TicketStatusName) =>
    `${status === 'awaiting_customer' ? '📩' : '⏳'} #${faNumber.format(id)} · ${ticketTopicLabels[topic]}`,
  chooseTopic: 'موضوع تیکت را انتخاب کنید:',
  chooseOrder: 'تیکت درباره‌ی کدام سفارش است؟',
  orderButton: (id: number, line: string) => `#${faNumber.format(id)} · ${line}`,
  writeTicket:
    '✍️ پیام خود را بنویسید. می‌توانید <b>عکس</b> (مثلاً اسکرین‌شات خطا) یا <b>فایل</b> هم بفرستید.',
  ticketOpened: (id: number) =>
    `✅ تیکت #${faNumber.format(id)} ثبت شد. پاسخ پشتیبانی همین‌جا برایتان ارسال می‌شود.`,
  ticketMessageAdded: (id: number) => `✅ پیام شما به تیکت #${faNumber.format(id)} اضافه شد.`,
  ticketClosed: (id: number) => `🔒 تیکت #${faNumber.format(id)} بسته شد.`,
  ticketView: (
    id: number,
    topic: TicketTopicName,
    messages: { fromAdmin: boolean; text: string | null; hasFile: boolean }[],
  ) =>
    [
      `🎫 <b>تیکت #${faNumber.format(id)}</b> · ${ticketTopicLabels[topic]}`,
      '',
      ...messages
        .slice(-8)
        .map(
          (m) =>
            `${m.fromAdmin ? '🎧 <b>پشتیبانی:</b>' : '👤 <b>شما:</b>'} ${m.text ? escapeHtml(m.text) : ''}${m.hasFile ? ' 📎' : ''}`,
        ),
    ].join('\n'),
  ticketReplyToCustomer: (id: number, text: string) =>
    `📩 <b>پاسخ پشتیبانی</b> — تیکت #${faNumber.format(id)}\n\n${escapeHtml(text)}`,
  ticketAlert: (args: {
    ticketId: number;
    topic: TicketTopicName;
    orderId: number | null;
    customerName: string;
    username: string | null;
    isNew: boolean;
    text: string | null;
    hasFile: boolean;
  }) =>
    [
      `🎧 <b>${args.isNew ? 'تیکت جدید' : 'پیام جدید در تیکت'} #${faNumber.format(args.ticketId)}</b> · ${ticketTopicLabels[args.topic]}${args.orderId ? ` · سفارش #${faNumber.format(args.orderId)}` : ''}`,
      `👤 ${escapeHtml(args.customerName)}${args.username ? ` (@${escapeHtml(args.username)})` : ''}`,
      '',
      ...(args.text ? [escapeHtml(args.text.slice(0, 1000))] : []),
      ...(args.hasFile ? ['📎 فایل پیوست (در پیام بعدی)'] : []),
      '',
      '↩️ برای پاسخ، روی همین پیام Reply بزنید.',
    ].join('\n'),

  // ── My purchases ──
  myOrdersTitle: (count: number) =>
    count > 0
      ? '📦 <b>خریدهای من</b>\n\nبرای دیدن جزئیات و اطلاعات تحویل، روی هر سفارش بزنید:'
      : '📦 هنوز خریدی نداشته‌اید.',
  myOrderButton: (id: number, line: string, status: OrderStatusName) =>
    `${orderStatusIcons[status]} #${faNumber.format(id)} · ${line}`,
  myOrderDetail: (args: {
    id: number;
    line: string;
    quantity: number;
    total: Toman;
    status: OrderStatusName;
    createdAt: Date;
    expiresAt: Date | null;
    items: string[];
    note: string | null;
    rejectReason: string | null;
  }) =>
    [
      `🧾 <b>سفارش #${faNumber.format(args.id)}</b>`,
      `${escapeHtml(args.line)}${args.quantity > 1 ? ` × ${faNumber.format(args.quantity)}` : ''}`,
      `💰 ${formatToman(args.total)} · 📅 ${shortDate.format(args.createdAt)}`,
      `وضعیت: ${orderStatusIcons[args.status]} ${orderStatusLabels[args.status]}`,
      ...(args.expiresAt
        ? [
            args.expiresAt > new Date()
              ? `⏳ اعتبار تا ${shortDate.format(args.expiresAt)}`
              : `⌛️ منقضی شده (${shortDate.format(args.expiresAt)})`,
          ]
        : []),
      ...(args.items.length > 0
        ? [
            '',
            '<b>اطلاعات تحویل:</b>',
            ...args.items.map((item) => `<pre>${escapeHtml(item)}</pre>`),
          ]
        : []),
      ...(args.note ? ['', '<b>پیام ادمین:</b>', escapeHtml(args.note)] : []),
      ...(args.rejectReason
        ? ['', `دلیل: ${escapeHtml(args.rejectReason)} (مبلغ به کیف پول برگشت داده شد)`]
        : []),
    ].join('\n'),

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
  receiptSaved: (topupId: number, resumesPurchase: boolean) =>
    `✅ رسید شما ثبت شد (درخواست #${faNumber.format(topupId)}).\nپس از بررسی توسط پشتیبانی، نتیجه همین‌جا اعلام می‌شود.${resumesPurchase ? '\n🛒 بعد از تأیید، با یک دکمه خریدتان را ادامه می‌دهید.' : ''}`,
  resumePurchaseHint: '\n🛒 خرید نیمه‌کاره‌ی شما آماده است؛ برای ادامه دکمه‌ی زیر را بزنید.',
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
  banned:
    '🚫 حساب شما مسدود شده است. موجودی کیف پول شما محفوظ است.\nبرای پیگیری می‌توانید از دکمه‌ی زیر با پشتیبانی در ارتباط باشید.',
  directMessage: (text: string) => `📬 <b>پیام از پشتیبانی</b>\n\n${escapeHtml(text)}`,

  joinRequired: (channelUrl: string) =>
    [
      '📢 برای استفاده از ربات، ابتدا در کانال ما عضو شوید.',
      '',
      channelUrl,
      '',
      'بعد از عضویت، دکمه‌ی «عضو شدم» را بزنید.',
    ].join('\n'),
  notJoinedYet: 'هنوز عضو کانال نشده‌اید ❗️',

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
    pay: (total: Toman) => `✅ پرداخت ${formatToman(total)} و خرید`,
    topupShortfall: (shortfall: Toman) => `💳 شارژ ${formatToman(shortfall)}`,
    quantity: (n: number) => faNumber.format(n),
    moreQuantity: '🔢 تعداد بیشتر',
    contactSupport: '🎧 تماس با پشتیبانی',
    renew: '🔁 تمدید',
    resumePurchase: '🛒 ادامه‌ی خرید',
    myOrders: '📦 خریدهای من',
    orderSupport: '🎧 پشتیبانی این سفارش',
    deliver: '📦 تحویل',
    rejectRefund: '❌ رد و بازپرداخت',
    showPassword: '🔑 نمایش رمز',
    closeTicketAdmin: '🔒 بستن تیکت',
    newTicket: '➕ تیکت جدید',
    replyTicket: '✍️ پاسخ',
    closeTicket: '🔒 بستن تیکت',
    noOrder: 'مربوط به سفارش خاصی نیست',
    topic: (topic: TicketTopicName) => ticketTopicLabels[topic],
  },
} as const;

export { topupRejectReasons } from '@abis/shared';

/** Preset reasons for rejecting a manual order from the chat alert. */
export const orderRejectReasons = [
  'موجودی این سرویس فعلاً تمام شده است',
  'امکان فعال‌سازی روی این ایمیل وجود ندارد',
  'اطلاعات واردشده نادرست است',
] as const;

/** Escapes user-controlled text for parse_mode HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Admin menu (/admin) ──────────────────────────────────────────────────────

export const adminTexts = {
  home: (args: {
    pendingTopups: number;
    queuedOrders: number;
    openTickets: number;
    salesToday: Toman;
    salesCountToday: number;
    topupsToday: Toman;
    newCustomersToday: number;
  }) =>
    [
      '🛠 <b>مدیریت فروشگاه</b>',
      '',
      '<b>امروز</b> (از نیمه‌شب به وقت تهران):',
      `🛒 فروش: ${formatToman(args.salesToday)} — ${faNumber.format(args.salesCountToday)} سفارش`,
      `💳 شارژ تأییدشده: ${formatToman(args.topupsToday)}`,
      `👤 کاربران تازه‌عضو: ${faNumber.format(args.newCustomersToday)}`,
      '',
      args.pendingTopups + args.queuedOrders + args.openTickets === 0
        ? '✅ کار در انتظاری نیست.'
        : '⏳ کارهای در انتظار در دکمه‌های زیر است.',
    ].join('\n'),
  buttons: {
    topups: (n: number) => `💳 واریزها (${faNumber.format(n)})`,
    orders: (n: number) => `🛒 سفارش‌های دستی (${faNumber.format(n)})`,
    tickets: (n: number) => `🎧 تیکت‌ها (${faNumber.format(n)})`,
    customers: '👤 جست‌وجوی کاربر',
    broadcast: '📣 پیام همگانی',
    catalog: '📦 انبار و قیمت',
    cards: '🏦 کارت‌ها',
    settings: '⚙️ تنظیمات',
    back: '🔙 منوی مدیریت',
    credit: '➕ افزایش موجودی',
    debit: '➖ کاهش موجودی',
    message: '📬 پیام',
    ban: '🚫 مسدود کردن',
    unban: '✅ رفع مسدودیت',
    send: (n: number) => `✅ ارسال برای ${faNumber.format(n)} نفر`,
    changePrice: '💰 تغییر قیمت',
    addStock: '📦 افزودن به انبار',
    toggleVariant: (active: boolean) =>
      active ? '🔌 غیرفعال کردن این مدت' : '🔌 فعال کردن این مدت',
    toggleProduct: (active: boolean) => (active ? '⛔️ غیرفعال کردن محصول' : '✅ فعال کردن محصول'),
    toggleFeatured: (featured: boolean) => (featured ? '⭐ حذف از ویژه' : '⭐ ویژه کردن'),
    addCard: '➕ کارت جدید',
    webPanel: '🌐 پنل وب (ساخت محصول و…)',
    openPanel: '🌐 باز کردن پنل',
    toggle: (label: string, on: boolean) => `${on ? '✅' : '⬜️'} ${label}`,
    edit: (label: string, value: string) => `✏️ ${label}: ${value}`,
  },
  emptyQueue: 'موردی در انتظار نیست ✅',
  queueSent: (n: number) => `${faNumber.format(n)} مورد در پیام‌های بعدی ارسال شد.`,
  askSearch: '🔎 نام، ‎@یوزرنیم، شماره موبایل یا شناسه‌ی عددی کاربر را بفرستید:',
  noCustomer: 'کاربری پیدا نشد.',
  chooseCustomer: 'کاربر را انتخاب کنید:',
  customerCard: (args: {
    name: string;
    username: string | null;
    phone: string | null;
    telegramId: number;
    balance: Toman;
    banned: boolean;
    recent: { amountToman: number; kind: LedgerKind; reason: string | null }[];
  }) =>
    [
      `👤 <b>${escapeHtml(args.name)}</b>${args.username ? ` (@${escapeHtml(args.username)})` : ''}${args.banned ? ' 🚫 مسدود' : ''}`,
      `📱 ${args.phone ?? '—'} · <code>${args.telegramId}</code>`,
      `💰 موجودی: <b>${formatToman(args.balance)}</b>`,
      ...(args.recent.length
        ? [
            '',
            ...args.recent.map(
              (e) =>
                `${e.amountToman > 0 ? '➕' : '➖'} ${formatToman(toman(Math.abs(e.amountToman)))} · ${ledgerKindLabels[e.kind]}${e.reason ? ` — ${escapeHtml(e.reason)}` : ''}`,
            ),
          ]
        : []),
    ].join('\n'),
  askAdjust: (sign: 1 | -1) =>
    `${sign > 0 ? '➕ افزایش' : '➖ کاهش'} موجودی: مبلغ و دلیل را در یک پیام بفرستید.\nمثال: <code>200000 جبران تأخیر</code>\nبرای لغو /cancel`,
  badAdjust: 'فرمت درست: مبلغ (عدد) و بعد دلیل. مثال: 200000 جبران تأخیر',
  adjusted: (balance: Toman) => `✅ ثبت شد. موجودی جدید: ${formatToman(balance)}`,
  askDm: '📬 متن پیام را بفرستید (برای لغو /cancel):',
  dmSent: '✅ پیام ارسال شد.',
  dmFailed: 'ارسال نشد؛ احتمالاً کاربر ربات را بلاک کرده است.',
  askBroadcast: '📣 متن پیام همگانی را بفرستید (برای لغو /cancel):',
  confirmBroadcast: (text: string, n: number) =>
    `📣 <b>پیش‌نمایش</b> (برای ${faNumber.format(n)} نفر):\n\n${escapeHtml(text)}`,
  broadcastStarted: (n: number) =>
    `✅ ارسال برای ${faNumber.format(n)} نفر شروع شد. با سرعت مجاز تلگرام چند دقیقه طول می‌کشد.`,
  chooseProvider: '📦 شرکت را انتخاب کنید:',
  chooseProduct: 'محصول را انتخاب کنید:',
  chooseVariant: (name: string, active: boolean, featured: boolean) =>
    `<b>${escapeHtml(name)}</b>${active ? '' : ' (غیرفعال)'}${featured ? ' ⭐' : ''}\nمدت را انتخاب کنید:`,
  variantCard: (line: string, price: Toman, stock: number | null, sold: number, active: boolean) =>
    [
      `<b>${escapeHtml(line)}</b>${active ? '' : ' (غیرفعال)'}`,
      `💰 قیمت: ${formatToman(price)}`,
      `📦 موجودی: ${stock === null ? 'بدون انبار (فعال‌سازی روی ایمیل)' : faNumber.format(stock)}`,
      `📈 فروش: ${faNumber.format(sold)}`,
    ].join('\n'),
  askPrice: '💰 قیمت جدید را به تومان بفرستید (برای لغو /cancel):',
  badNumber: 'لطفاً فقط یک عدد بفرستید.',
  priceSaved: (price: Toman) => `✅ قیمت به ${formatToman(price)} تغییر کرد.`,
  askStock: (isLink: boolean) =>
    isLink
      ? '📦 لینک‌ها را بفرستید؛ هر لینک در یک خط (برای لغو /cancel):'
      : '📦 اکانت‌ها را بفرستید؛ هر اکانت (مثلاً ایمیل و رمز در دو خط) با یک خط خالی از بعدی جدا شود (برای لغو /cancel):',
  stockAdded: (n: number) =>
    `✅ ${faNumber.format(n)} آیتم به انبار اضافه شد. پیام شما برای امنیت پاک شد.`,
  cards: (cards: { number: string; holderName: string; bankName: string; isActive: boolean }[]) =>
    cards.length === 0
      ? '🏦 هنوز کارتی ثبت نشده. بدون کارت فعال، شارژ کیف پول غیرفعال است.'
      : [
          '🏦 <b>کارت‌ها</b> — کارت فعال به مشتری‌ها نشان داده می‌شود:',
          '',
          ...cards.map(
            (c) =>
              `${c.isActive ? '✅' : '▫️'} <code>${c.number.replace(/(\d{4})(?=\d)/g, '$1-')}</code> · ${escapeHtml(c.holderName)} · ${escapeHtml(c.bankName)}`,
          ),
        ].join('\n'),
  cardButton: (number: string, active: boolean) =>
    `${active ? '✅' : 'فعال کن'} ****${number.slice(-4)}`,
  askCard: '➕ سه خط بفرستید:\n۱) شماره کارت\n۲) نام صاحب کارت\n۳) نام بانک\n(برای لغو /cancel)',
  badCard: 'اطلاعات کارت معتبر نیست. شماره ۱۶ رقمی، نام و بانک را هر کدام در یک خط بفرستید.',
  cardAdded: '✅ کارت اضافه شد. برای نمایش به مشتری‌ها «فعال کن» را بزنید.',
  settingsTitle: '⚙️ <b>تنظیمات</b>',
  settingLabels: {
    forcedJoin: 'عضویت اجباری کانال',
    requirePhone: 'شماره موبایل قبل از شارژ',
    topupMinToman: 'حداقل شارژ',
    topupMaxToman: 'حداکثر شارژ',
    lowStockThreshold: 'هشدار کمبود انبار',
  },
  askSetting: (label: string) => `✏️ مقدار جدید «${label}» را بفرستید (عدد؛ برای لغو /cancel):`,
  settingSaved: '✅ ذخیره شد.',
  failed: (message: string) => `❗️ ${message}`,
  cancelled: 'لغو شد.',
  panelLink:
    '🌐 لینک ورود به پنل وب (یک‌بارمصرف، ۱۰ دقیقه اعتبار). در مرورگر گوشی یا کامپیوتر باز کنید؛ ورود ۱۲ ساعت معتبر می‌ماند.\n<i>این لینک را برای کسی نفرستید.</i>',
  noPublicUrl:
    'آدرس سرور (PUBLIC_URL) هنوز تنظیم نشده است؛ پنل وب بعد از راه‌اندازی روی سرور در دسترس است.',
};
