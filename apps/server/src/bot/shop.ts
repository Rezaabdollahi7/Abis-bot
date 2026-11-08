import { Composer, type InlineKeyboard } from 'grammy';
import type { Db } from '../db/client.js';
import {
  getVariantView,
  listFeaturedVariants,
  listProductVariants,
  listProviderProducts,
  listShopProviders,
} from '../modules/catalog/index.js';
import type { BotContext } from './context.js';
import {
  cb,
  homeOnly,
  listKeyboard,
  shopCb,
  shopCbPattern,
  shopKeyboard,
  variantKeyboard,
} from './keyboards.js';
import { texts } from './texts.js';

export const FEATURED_PAGE_SIZE = 8;

/** Shop navigation: providers → products → durations → product card. All edits in place. */
export function shopComposer(db: Db): Composer<BotContext> {
  const shop = new Composer<BotContext>();

  async function show(ctx: BotContext, text: string, keyboard: InlineKeyboard) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
  }

  async function showShop(ctx: BotContext, page: number) {
    const [providers, featured] = await Promise.all([
      listShopProviders(db),
      listFeaturedVariants(db, page, FEATURED_PAGE_SIZE),
    ]);
    if (providers.length === 0) return show(ctx, texts.shopEmpty, homeOnly());
    await show(
      ctx,
      texts.shop(featured.page, featured.totalPages),
      shopKeyboard({
        providers,
        featured: featured.items.map((view) => ({
          id: view.variant.id,
          label: texts.variantButton(view),
        })),
        page: featured.page,
        totalPages: featured.totalPages,
      }),
    );
  }

  shop.callbackQuery(cb.shop, (ctx) => showShop(ctx, 1));
  shop.callbackQuery(shopCbPattern.page, (ctx) => showShop(ctx, Number(ctx.match[1])));

  shop.callbackQuery(shopCbPattern.provider, async (ctx) => {
    const providerId = Number(ctx.match[1]);
    const productList = await listProviderProducts(db, providerId);
    const provider = (await listShopProviders(db)).find((p) => p.id === providerId);
    if (!provider || productList.length === 0) return notAvailable(ctx);
    await show(
      ctx,
      texts.provider(provider.emoji, provider.name),
      listKeyboard(
        productList.map((p) => ({ label: p.name, data: shopCb.product(p.id) })),
        cb.shop,
      ),
    );
  });

  shop.callbackQuery(shopCbPattern.product, async (ctx) => {
    const views = await listProductVariants(db, Number(ctx.match[1]));
    const first = views[0];
    if (!first) return notAvailable(ctx);
    await show(
      ctx,
      texts.product(first.product.name),
      listKeyboard(
        views.map((view) => ({
          label: texts.durationButton(view),
          data: shopCb.variant(view.variant.id),
        })),
        shopCb.provider(first.provider.id),
      ),
    );
  });

  shop.callbackQuery(shopCbPattern.variant, async (ctx) => {
    const view = await getVariantView(db, Number(ctx.match[1]));
    if (!view) return notAvailable(ctx);
    await show(ctx, texts.variantCard(view), variantKeyboard(view.variant.id, view.product.id));
  });

  return shop;
}

async function notAvailable(ctx: BotContext) {
  await ctx.answerCallbackQuery({ text: texts.notAvailable, show_alert: true });
}
