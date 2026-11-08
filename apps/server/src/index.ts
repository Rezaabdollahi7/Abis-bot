import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createApi } from './api/index.js';
import { createBot } from './bot/index.js';
import { connectDb, runMigrations } from './db/client.js';
import { createCipher } from './lib/cipher.js';
import { startJobs } from './jobs/index.js';
import { listAdminTelegramIds } from './modules/admins/index.js';
import { loadConfig } from './lib/config.js';

const config = loadConfig();
const cipher = createCipher(config.ENCRYPTION_KEY);

const { db } = connectDb(config.DATABASE_URL);
await runMigrations(db);

// Optional outbound proxy for the Bot API (e.g. a sandbox or a network that needs one).
const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const bot = createBot({
  db,
  cipher,
  config,
  ...(proxy
    ? { botConfig: { client: { baseFetchConfig: { agent: new HttpsProxyAgent(proxy) } } } }
    : {}),
});

const app = new Hono();
app.get('/health', (c) => c.json({ ok: true }));
app.route('/api', createApi({ db, telegram: bot.api, cipher, config }));

serve({ fetch: app.fetch, port: config.PORT }, ({ port }) => {
  console.log(`HTTP server listening on :${port}`);
});

startJobs(bot.api, db);

// Command menu: everyone sees /start; admins also see /admin in their own chat.
await bot.api
  .setMyCommands([{ command: 'start', description: 'منوی اصلی' }])
  .catch((error: unknown) => console.error('setMyCommands failed:', error));
for (const chatId of await listAdminTelegramIds(db, config.OWNER_TELEGRAM_IDS)) {
  await bot.api
    .setMyCommands(
      [
        { command: 'start', description: 'منوی اصلی' },
        { command: 'admin', description: 'مدیریت فروشگاه' },
      ],
      { scope: { type: 'chat', chat_id: chatId } },
    )
    .catch(() => undefined); // admins who never started the bot can't get a chat scope
}

// Long polling for local development; production switches to a webhook in phase 5.
void bot.start({ onStart: ({ username }) => console.log(`Bot @${username} started`) });
