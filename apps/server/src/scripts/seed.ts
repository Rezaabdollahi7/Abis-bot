// Sample catalog for local development: pnpm --filter @abis/server db:seed
// Skips if any provider exists, so it never touches real data.
import { toman } from '@abis/shared';
import { connectDb, runMigrations } from '../db/client.js';
import {
  createProduct,
  createProvider,
  createVariant,
  hasAnyProvider,
} from '../modules/catalog/index.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const { db, close } = connectDb(url);
await runMigrations(db);

if (await hasAnyProvider(db)) {
  console.log('Catalog already has providers; nothing seeded.');
} else {
  const openai = await createProvider(db, { name: 'ChatGPT', emoji: '🟢', sortOrder: 1 });
  const anthropic = await createProvider(db, { name: 'Claude', emoji: '🟠', sortOrder: 2 });
  const google = await createProvider(db, { name: 'Gemini', emoji: '🔵', sortOrder: 3 });
  const perplexity = await createProvider(db, { name: 'Perplexity', emoji: '🟣', sortOrder: 4 });

  const chatgpt = await createProduct(db, {
    providerId: openai.id,
    name: 'ChatGPT Plus',
    description: '✅ فعال‌سازی روی ایمیل خودتان\n✅ دسترسی به جدیدترین مدل‌ها',
    deliveryMethod: 'email_activation',
    requiredFields: ['email'],
    warrantyDays: 30,
    etaMinutes: 30,
    isFeatured: true,
  });
  const claude = await createProduct(db, {
    providerId: anthropic.id,
    name: 'Claude Pro',
    description: '✅ فعال‌سازی روی ایمیل خودتان',
    deliveryMethod: 'email_activation',
    requiredFields: ['email', 'password'],
    warrantyDays: 30,
    etaMinutes: 60,
    isFeatured: true,
  });
  const gemini = await createProduct(db, {
    providerId: google.id,
    name: 'Google AI Pro',
    description: '✅ فعال‌سازی با لینک\n⚠️ لینک را تا ۱۰ دقیقه پس از دریافت فعال کنید',
    deliveryMethod: 'link',
    warrantyDays: 7,
    isFeatured: true,
  });
  const pplx = await createProduct(db, {
    providerId: perplexity.id,
    name: 'Perplexity Pro',
    description: '✅ اکانت آماده با ایمیل و رمز',
    deliveryMethod: 'ready_account',
    warrantyDays: 14,
  });

  await createVariant(db, {
    productId: chatgpt.id,
    durationDays: 30,
    priceToman: toman(1_450_000),
  });
  await createVariant(db, {
    productId: chatgpt.id,
    durationDays: 90,
    priceToman: toman(4_100_000),
  });
  await createVariant(db, { productId: claude.id, durationDays: 30, priceToman: toman(1_600_000) });
  await createVariant(db, { productId: gemini.id, durationDays: 30, priceToman: toman(450_000) });
  await createVariant(db, {
    productId: gemini.id,
    durationDays: 360,
    priceToman: toman(2_900_000),
  });
  await createVariant(db, { productId: pplx.id, durationDays: 360, priceToman: toman(1_200_000) });
  console.log('Seeded sample catalog (prices are placeholders).');
}

await close();
