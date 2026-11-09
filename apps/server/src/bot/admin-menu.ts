import { bankCardInput, normalizeDigits, toman } from '@abis/shared';
import { Composer, GrammyError, InlineKeyboard } from 'grammy';
import type { Db } from '../db/client.js';
import type { Cipher } from '../lib/cipher.js';
import { createLoginToken, resolveAdmin } from '../modules/admins/index.js';
import { createBroadcast } from '../modules/broadcasts/index.js';
import { catalogAdmin, getFullCatalog, usesStock } from '../modules/catalog/index.js';
import {
  countCustomersSince,
  getCustomer,
  listBroadcastRecipients,
  searchCustomers,
  setBanned,
} from '../modules/customers/index.js';
import { countQueuedOrders, listOrders, salesSince } from '../modules/orders/index.js';
import {
  SettingsError,
  addBankCard,
  getSettings,
  listBankCards,
  setActiveBankCard,
  updateSettings,
} from '../modules/settings/index.js';
import { StockError, addStock } from '../modules/stock/index.js';
import { countTicketsAwaitingAdmin, listMessages, listTickets } from '../modules/tickets/index.js';
import {
  AdjustmentError,
  countPendingTopups,
  createAdjustment,
  getBalance,
  listLedger,
  listTopups,
  topupsSince,
} from '../modules/wallet/index.js';
import { sendBroadcast } from './broadcast.js';
import type { BotContext } from './context.js';
import { cb } from './keyboards.js';
import { alertAdminsOfQueuedOrder } from './order-alerts.js';
import type { SessionData } from './session.js';
import { alertAdminsOfTicket } from './support.js';
import { adminTexts as t, formatDuration, texts } from './texts.js';
import { alertAdminsOfTopup } from './topup-alerts.js';

const QUEUE_LIMIT = 10;
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

function startOfTehranDay(now = new Date()): Date {
  const local = now.getTime() + TEHRAN_OFFSET_MS;
  return new Date(local - (local % DAY_MS) - TEHRAN_OFFSET_MS);
}

type AdminInput = NonNullable<SessionData['adminInput']>;

/**
 * `/admin`: the whole day-to-day back office inside the chat (ADR-0005).
 * Every action calls the same module functions as the web panel.
 */
export function adminMenuComposer(
  db: Db,
  cipher: Cipher,
  ownerIds: readonly number[],
  publicUrl?: string,
): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  const isAdmin = async (ctx: BotContext) =>
    ctx.from !== undefined && (await resolveAdmin(db, ownerIds, ctx.from.id)) !== undefined;
  composer
    .callbackQuery(/^am:/)
    .drop(isAdmin, (ctx) => ctx.answerCallbackQuery({ text: texts.notAdmin, show_alert: true }));
  const admin = composer.filter(isAdmin);
  const backButton = () => new InlineKeyboard().text(t.buttons.back, 'am:home');

  /** Edits the menu message when coming from a button, otherwise sends a new one. */
  async function show(ctx: BotContext, text: string, keyboard: InlineKeyboard) {
    const options = { parse_mode: 'HTML' as const, reply_markup: keyboard };
    if (ctx.callbackQuery?.message) {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(text, options).catch(() => ctx.reply(text, options));
    } else {
      await ctx.reply(text, options);
    }
  }

  function ask(ctx: BotContext, input: AdminInput, prompt: string) {
    ctx.session = { step: 'admin_input', adminInput: input };
    return ctx.reply(prompt, { parse_mode: 'HTML' });
  }

  // ── Home ──

  async function home(ctx: BotContext) {
    ctx.session = {};
    const today = startOfTehranDay();
    const [pendingTopups, queuedOrders, openTickets, sales, topups, newCustomers] =
      await Promise.all([
        countPendingTopups(db),
        countQueuedOrders(db),
        countTicketsAwaitingAdmin(db),
        salesSince(db, today),
        topupsSince(db, today),
        countCustomersSince(db, today),
      ]);
    const keyboard = new InlineKeyboard()
      .text(t.buttons.topups(pendingTopups), 'am:topups')
      .text(t.buttons.orders(queuedOrders), 'am:orders')
      .row()
      .text(t.buttons.tickets(openTickets), 'am:tickets')
      .text(t.buttons.customers, 'am:cust')
      .row()
      .text(t.buttons.broadcast, 'am:bc')
      .text(t.buttons.catalog, 'am:cat')
      .row()
      .text(t.buttons.cards, 'am:cards')
      .text(t.buttons.settings, 'am:set')
      .row()
      .text(t.buttons.history, 'ah:menu')
      .text(t.buttons.webPanel, 'am:web');
    await show(
      ctx,
      t.home({
        pendingTopups,
        queuedOrders,
        openTickets,
        salesToday: sales.total,
        salesCountToday: sales.count,
        topupsToday: topups.total,
        newCustomersToday: newCustomers,
      }),
      keyboard,
    );
  }

  admin.command('admin', home);
  admin.callbackQuery('am:home', home);

  /** One-time link to the web panel in a normal browser (for heavy editing). */
  async function panelLink(ctx: BotContext) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery();
    if (!publicUrl || !ctx.from) return ctx.reply(t.noPublicUrl);
    const token = await createLoginToken(db, ctx.from.id);
    const url = `${publicUrl.replace(/\/$/, '')}/?login=${token}`;
    await ctx.reply(t.panelLink, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().url(t.buttons.openPanel, url),
    });
  }

  admin.command('panel', panelLink);
  admin.callbackQuery('am:web', panelLink);

  // ── Queues: re-send the actionable alerts to this admin ──

  admin.callbackQuery('am:topups', async (ctx) => {
    await ctx.answerCallbackQuery();
    const pending = await listTopups(db, 'pending', QUEUE_LIMIT);
    for (const topup of pending)
      await alertAdminsOfTopup(ctx.api, db, ownerIds, topup, [ctx.from.id]);
    await ctx.reply(pending.length ? t.queueSent(pending.length) : t.emptyQueue, {
      reply_markup: backButton(),
    });
  });

  admin.callbackQuery('am:orders', async (ctx) => {
    await ctx.answerCallbackQuery();
    const queued = await listOrders(db, 'queued', QUEUE_LIMIT);
    for (const order of queued) {
      await alertAdminsOfQueuedOrder(ctx.api, db, ownerIds, cipher, order, [ctx.from.id]);
    }
    await ctx.reply(queued.length ? t.queueSent(queued.length) : t.emptyQueue, {
      reply_markup: backButton(),
    });
  });

  admin.callbackQuery('am:tickets', async (ctx) => {
    await ctx.answerCallbackQuery();
    const open = await listTickets(db, 'awaiting_admin', QUEUE_LIMIT);
    for (const ticket of open) {
      const last = (await listMessages(db, ticket.id)).at(-1);
      await alertAdminsOfTicket(
        ctx.api,
        db,
        ownerIds,
        ticket,
        {
          text: last?.text ?? undefined,
          fileId: last?.fileId ?? undefined,
          fileKind: last?.fileKind ?? undefined,
        },
        false,
        [ctx.from.id],
      );
    }
    await ctx.reply(open.length ? t.queueSent(open.length) : t.emptyQueue, {
      reply_markup: backButton(),
    });
  });

  // ── Customers ──

  admin.callbackQuery('am:cust', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ask(ctx, { kind: 'search' }, t.askSearch);
  });

  async function customerCard(ctx: BotContext, customerId: number) {
    const customer = await getCustomer(db, customerId);
    if (!customer) return ctx.reply(t.noCustomer);
    const [balance, recent] = await Promise.all([
      getBalance(db, customer.id),
      listLedger(db, customer.id, 5),
    ]);
    const keyboard = new InlineKeyboard()
      .text(t.buttons.credit, `am:cadj:${customer.id}:p`)
      .success()
      .text(t.buttons.debit, `am:cadj:${customer.id}:m`)
      .row()
      .text(t.buttons.message, `am:cdm:${customer.id}`)
      .text(customer.isBanned ? t.buttons.unban : t.buttons.ban, `am:cban:${customer.id}`)
      .row()
      .append(backButton());
    await show(
      ctx,
      t.customerCard({
        name: customer.firstName,
        username: customer.username,
        phone: customer.phone,
        telegramId: customer.telegramId,
        balance,
        banned: customer.isBanned,
        recent,
      }),
      keyboard,
    );
  }

  admin.callbackQuery(/^am:c:(\d+)$/, (ctx) => customerCard(ctx, Number(ctx.match[1])));

  admin.callbackQuery(/^am:cadj:(\d+):([pm])$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const sign = ctx.match[2] === 'p' ? 1 : -1;
    await ask(ctx, { kind: 'adjust', customerId: Number(ctx.match[1]), sign }, t.askAdjust(sign));
  });

  admin.callbackQuery(/^am:cdm:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ask(ctx, { kind: 'dm', customerId: Number(ctx.match[1]) }, t.askDm);
  });

  admin.callbackQuery(/^am:cban:(\d+)$/, async (ctx) => {
    const customer = await getCustomer(db, Number(ctx.match[1]));
    if (!customer) return ctx.answerCallbackQuery();
    await setBanned(db, {
      customerId: customer.id,
      banned: !customer.isBanned,
      actor: ctx.from.id,
    });
    await customerCard(ctx, customer.id);
  });

  // ── Broadcast ──

  admin.callbackQuery('am:bc', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ask(ctx, { kind: 'broadcast' }, t.askBroadcast);
  });

  admin.callbackQuery('am:bcs', async (ctx) => {
    const text =
      ctx.session.adminInput?.kind === 'broadcast' ? ctx.session.adminInput.text : undefined;
    ctx.session = {};
    if (!text) return ctx.answerCallbackQuery({ text: texts.confirmExpired, show_alert: true });
    await ctx.answerCallbackQuery();
    const { broadcast, recipients } = await createBroadcast(db, { text, actor: ctx.from.id });
    void sendBroadcast(ctx.api, db, broadcast, recipients).catch((error: unknown) =>
      console.error(`Broadcast ${broadcast.id} failed:`, error),
    );
    await ctx.editMessageText(t.broadcastStarted(recipients.length), {
      reply_markup: backButton(),
    });
  });

  // ── Catalog: stock, price, on/off ──

  admin.callbackQuery('am:cat', async (ctx) => {
    const catalog = await getFullCatalog(db);
    const keyboard = new InlineKeyboard();
    catalog.forEach((p, i) => {
      if (i > 0 && i % 2 === 0) keyboard.row();
      keyboard.text(`${p.emoji} ${p.name}`, `am:pv:${p.id}`);
    });
    await show(ctx, t.chooseProvider, keyboard.row().append(backButton()));
  });

  admin.callbackQuery(/^am:pv:(\d+)$/, async (ctx) => {
    const provider = (await getFullCatalog(db)).find((p) => p.id === Number(ctx.match[1]));
    if (!provider) return ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard();
    for (const product of provider.products) {
      keyboard.text(`${product.isActive ? '' : '⛔️ '}${product.name}`, `am:pr:${product.id}`).row();
    }
    await show(ctx, t.chooseProduct, keyboard.text(texts.buttons.back, 'am:cat'));
  });

  async function productScreen(ctx: BotContext, productId: number) {
    const provider = (await getFullCatalog(db)).find((p) =>
      p.products.some((x) => x.id === productId),
    );
    const product = provider?.products.find((x) => x.id === productId);
    if (!provider || !product) return;
    const keyboard = new InlineKeyboard();
    for (const v of product.variants) {
      keyboard
        .text(
          `${v.isActive ? '' : '⛔️ '}${formatDuration(v.durationDays)} · ${texts.buttons.amount(toman(v.priceToman))}${v.stock === null ? '' : ` · 📦${v.stock}`}`,
          `am:v:${v.id}`,
        )
        .row();
    }
    keyboard
      .text(t.buttons.toggleProduct(product.isActive), `am:pt:${product.id}`)
      .text(t.buttons.toggleFeatured(product.isFeatured), `am:pf:${product.id}`)
      .row()
      .text(texts.buttons.back, `am:pv:${provider.id}`);
    await show(ctx, t.chooseVariant(product.name, product.isActive, product.isFeatured), keyboard);
  }

  admin.callbackQuery(/^am:pr:(\d+)$/, (ctx) => productScreen(ctx, Number(ctx.match[1])));

  admin.callbackQuery(/^am:p([tf]):(\d+)$/, async (ctx) => {
    const productId = Number(ctx.match[2]);
    const product = (await getFullCatalog(db))
      .flatMap((p) => p.products)
      .find((x) => x.id === productId);
    if (!product) return ctx.answerCallbackQuery();
    await catalogAdmin.updateProduct(
      db,
      ctx.from.id,
      productId,
      ctx.match[1] === 't' ? { isActive: !product.isActive } : { isFeatured: !product.isFeatured },
    );
    await productScreen(ctx, productId);
  });

  async function variantScreen(ctx: BotContext, variantId: number) {
    for (const provider of await getFullCatalog(db)) {
      for (const product of provider.products) {
        const v = product.variants.find((x) => x.id === variantId);
        if (!v) continue;
        const keyboard = new InlineKeyboard().text(t.buttons.changePrice, `am:vp:${v.id}`);
        if (usesStock(product.deliveryMethod)) keyboard.text(t.buttons.addStock, `am:vs:${v.id}`);
        keyboard
          .row()
          .text(t.buttons.toggleVariant(v.isActive), `am:vt:${v.id}`)
          .row()
          .text(texts.buttons.back, `am:pr:${product.id}`);
        return show(
          ctx,
          t.variantCard(
            `${provider.emoji} ${product.name} · ${formatDuration(v.durationDays)}`,
            toman(v.priceToman),
            v.stock,
            v.soldCount,
            v.isActive,
          ),
          keyboard,
        );
      }
    }
  }

  admin.callbackQuery(/^am:v:(\d+)$/, (ctx) => variantScreen(ctx, Number(ctx.match[1])));

  admin.callbackQuery(/^am:vt:(\d+)$/, async (ctx) => {
    const variantId = Number(ctx.match[1]);
    const v = (await getFullCatalog(db))
      .flatMap((p) => p.products.flatMap((x) => x.variants))
      .find((x) => x.id === variantId);
    if (!v) return ctx.answerCallbackQuery();
    await catalogAdmin.updateVariant(db, ctx.from.id, variantId, { isActive: !v.isActive });
    await variantScreen(ctx, variantId);
  });

  admin.callbackQuery(/^am:vp:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ask(ctx, { kind: 'price', variantId: Number(ctx.match[1]) }, t.askPrice);
  });

  admin.callbackQuery(/^am:vs:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const variantId = Number(ctx.match[1]);
    const product = (await getFullCatalog(db))
      .flatMap((p) => p.products)
      .find((x) => x.variants.some((v) => v.id === variantId));
    await ask(ctx, { kind: 'stock', variantId }, t.askStock(product?.deliveryMethod === 'link'));
  });

  // ── Bank cards ──

  async function cardsScreen(ctx: BotContext) {
    const cards = await listBankCards(db);
    const keyboard = new InlineKeyboard();
    for (const c of cards) {
      keyboard.text(t.cardButton(c.number, c.isActive), `am:ca:${c.isActive ? 0 : c.id}`).row();
    }
    keyboard.text(t.buttons.addCard, 'am:cadd').row().append(backButton());
    await show(ctx, t.cards(cards), keyboard);
  }

  admin.callbackQuery('am:cards', cardsScreen);

  admin.callbackQuery(/^am:ca:(\d+)$/, async (ctx) => {
    const cardId = Number(ctx.match[1]);
    await setActiveBankCard(db, ctx.from.id, cardId === 0 ? null : cardId);
    await cardsScreen(ctx);
  });

  admin.callbackQuery('am:cadd', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ask(ctx, { kind: 'card' }, t.askCard);
  });

  // ── Settings ──

  async function settingsScreen(ctx: BotContext) {
    const s = await getSettings(db);
    const labels = t.settingLabels;
    const keyboard = new InlineKeyboard()
      .text(t.buttons.toggle(labels.forcedJoin, s.forcedJoin), 'am:st:forcedJoin')
      .row()
      .text(t.buttons.toggle(labels.requirePhone, s.requirePhone), 'am:st:requirePhone')
      .row()
      .text(
        t.buttons.edit(labels.topupMinToman, texts.buttons.amount(toman(s.topupMinToman))),
        'am:se:topupMinToman',
      )
      .row()
      .text(
        t.buttons.edit(labels.topupMaxToman, texts.buttons.amount(toman(s.topupMaxToman))),
        'am:se:topupMaxToman',
      )
      .row()
      .text(
        t.buttons.edit(labels.lowStockThreshold, texts.buttons.quantity(s.lowStockThreshold)),
        'am:se:lowStockThreshold',
      )
      .row()
      .append(backButton());
    await show(ctx, t.settingsTitle, keyboard);
  }

  admin.callbackQuery('am:set', settingsScreen);

  admin.callbackQuery(/^am:st:(forcedJoin|requirePhone)$/, async (ctx) => {
    const key = ctx.match[1] as 'forcedJoin' | 'requirePhone';
    const current = await getSettings(db);
    await updateSettings(db, ctx.from.id, { [key]: !current[key] });
    await settingsScreen(ctx);
  });

  admin.callbackQuery(/^am:se:(topupMinToman|topupMaxToman|lowStockThreshold)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const settingKey = ctx.match[1] as 'topupMinToman' | 'topupMaxToman' | 'lowStockThreshold';
    await ask(ctx, { kind: 'setting', settingKey }, t.askSetting(t.settingLabels[settingKey]));
  });

  // ── Text answers to the prompts above ──

  admin.command('cancel', async (ctx, next) => {
    if (ctx.session.step !== 'admin_input') return next();
    ctx.session = {};
    await ctx.reply(t.cancelled, { reply_markup: backButton() });
  });

  admin.on('message:text', async (ctx, next) => {
    const input = ctx.session.adminInput;
    if (ctx.session.step !== 'admin_input' || !input || ctx.message.text.startsWith('/')) {
      return next();
    }
    const text = ctx.message.text.trim();
    const actor = ctx.from.id;
    const done = (message: string) => {
      ctx.session = {};
      return ctx.reply(message, { reply_markup: backButton() });
    };
    const number = () => {
      const digits = normalizeDigits(text);
      return /^\d{1,12}$/.test(digits) ? Number(digits) : undefined;
    };

    switch (input.kind) {
      case 'search': {
        const found = await searchCustomers(db, text, 8);
        ctx.session = {};
        if (found.length === 0) return ctx.reply(t.noCustomer, { reply_markup: backButton() });
        if (found.length === 1 && found[0]) return customerCard(ctx, found[0].id);
        const keyboard = new InlineKeyboard();
        for (const c of found) {
          keyboard
            .text(`${c.firstName}${c.username ? ` @${c.username}` : ''}`, `am:c:${c.id}`)
            .row();
        }
        return ctx.reply(t.chooseCustomer, { reply_markup: keyboard.append(backButton()) });
      }
      case 'adjust': {
        const match = /^([\d۰-۹٠-٩,٬]+)\s+(.{3,})$/s.exec(text);
        const amount = match?.[1] ? Number(normalizeDigits(match[1])) : NaN;
        if (!match?.[2] || !Number.isSafeInteger(amount) || amount <= 0 || !input.customerId) {
          return ctx.reply(t.badAdjust);
        }
        try {
          const { balance } = await createAdjustment(db, {
            customerId: input.customerId,
            amount: toman((input.sign ?? 1) * amount),
            reason: match[2].trim(),
            actor,
          });
          const customer = await getCustomer(db, input.customerId);
          if (customer) {
            await ctx.api
              .sendMessage(
                customer.telegramId,
                texts.adjusted(toman((input.sign ?? 1) * amount), match[2].trim(), balance),
                {
                  parse_mode: 'HTML',
                  reply_markup: new InlineKeyboard().text(texts.buttons.home, cb.home),
                },
              )
              .catch(() => undefined);
          }
          return done(t.adjusted(balance));
        } catch (error) {
          if (error instanceof AdjustmentError) return done(t.failed(error.message));
          throw error;
        }
      }
      case 'dm': {
        const customer = input.customerId ? await getCustomer(db, input.customerId) : undefined;
        if (!customer) return done(t.noCustomer);
        try {
          await ctx.api.sendMessage(customer.telegramId, texts.directMessage(text), {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text(texts.buttons.home, cb.home),
          });
          return done(t.dmSent);
        } catch (error) {
          if (error instanceof GrammyError) return done(t.dmFailed);
          throw error;
        }
      }
      case 'broadcast': {
        const recipients = (await listBroadcastRecipients(db)).length;
        ctx.session = { adminInput: { kind: 'broadcast', text } };
        return ctx.reply(t.confirmBroadcast(text, recipients), {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text(t.buttons.send(recipients), 'am:bcs')
            .success()
            .row()
            .text(texts.buttons.cancel, 'am:home'),
        });
      }
      case 'price': {
        const price = number();
        if (!price || !input.variantId) return ctx.reply(t.badNumber);
        await catalogAdmin.updateVariant(db, actor, input.variantId, { priceToman: price });
        return done(t.priceSaved(toman(price)));
      }
      case 'stock': {
        if (!input.variantId) return done(t.cancelled);
        await ctx.deleteMessage().catch(() => undefined);
        try {
          const added = await addStock(db, cipher, { variantId: input.variantId, text, actor });
          return done(t.stockAdded(added));
        } catch (error) {
          if (error instanceof StockError) return done(t.failed(error.message));
          throw error;
        }
      }
      case 'card': {
        const [number, holderName, bankName] = text.split('\n').map((l) => l.trim());
        const parsed = bankCardInput.safeParse({ number, holderName, bankName });
        if (!parsed.success) return ctx.reply(t.badCard);
        await addBankCard(db, actor, parsed.data);
        ctx.session = {};
        return cardsScreen(ctx);
      }
      case 'setting': {
        const value = number();
        if (value === undefined || !input.settingKey) return ctx.reply(t.badNumber);
        try {
          await updateSettings(db, actor, { [input.settingKey]: value });
        } catch (error) {
          if (error instanceof SettingsError) return done(t.failed(error.message));
          return done(t.failed('مقدار معتبر نیست'));
        }
        ctx.session = {};
        return settingsScreen(ctx);
      }
    }
  });

  return composer;
}
