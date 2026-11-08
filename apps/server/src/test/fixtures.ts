import { toman } from '@abis/shared';
import type { Db } from '../db/client.js';
import { createProduct, createProvider, createVariant } from '../modules/catalog/index.js';
import { stockItems } from '../modules/stock/schema.js';

/** A small catalog: OpenAI (email, featured) and Google (link with 2 stock items). */
export async function seedTestCatalog(db: Db) {
  const openai = await createProvider(db, { name: 'OpenAI', emoji: '🟢', sortOrder: 1 });
  const google = await createProvider(db, { name: 'Google', emoji: '🔵', sortOrder: 2 });
  const hidden = await createProvider(db, { name: 'Hidden', isActive: false });

  const chatgpt = await createProduct(db, {
    providerId: openai.id,
    name: 'ChatGPT Plus',
    description: 'Activated on your own account',
    deliveryMethod: 'email_activation',
    requiredFields: ['email'],
    warrantyDays: 30,
    etaMinutes: 30,
    isFeatured: true,
  });
  const gemini = await createProduct(db, {
    providerId: google.id,
    name: 'Gemini Pro',
    deliveryMethod: 'link',
    isFeatured: true,
  });
  const hiddenProduct = await createProduct(db, {
    providerId: hidden.id,
    name: 'Hidden Product',
    deliveryMethod: 'link',
    isFeatured: true,
  });

  const chatgpt1m = await createVariant(db, {
    productId: chatgpt.id,
    durationDays: 30,
    priceToman: toman(800_000),
  });
  const chatgpt3m = await createVariant(db, {
    productId: chatgpt.id,
    durationDays: 90,
    priceToman: toman(2_200_000),
  });
  const gemini12m = await createVariant(db, {
    productId: gemini.id,
    durationDays: 360,
    priceToman: toman(1_500_000),
  });
  await createVariant(db, {
    productId: hiddenProduct.id,
    durationDays: 30,
    priceToman: toman(1),
  });

  await db.insert(stockItems).values([
    { variantId: gemini12m.id, payloadEncrypted: 'x' },
    { variantId: gemini12m.id, payloadEncrypted: 'y' },
    { variantId: gemini12m.id, payloadEncrypted: 'z', status: 'sold' },
  ]);

  return { openai, google, chatgpt, gemini, chatgpt1m, chatgpt3m, gemini12m };
}
