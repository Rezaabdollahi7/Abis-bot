import { serve } from '@hono/node-server';
import { Bot } from 'grammy';
import { Hono } from 'hono';
import { connectDb, runMigrations } from './db/client.js';
import { loadConfig } from './lib/config.js';

const config = loadConfig();

const { db } = connectDb(config.DATABASE_URL);
await runMigrations(db);

const bot = new Bot(config.BOT_TOKEN);
// Placeholder until the real welcome flow (ROADMAP phase 1).
bot.command('start', (ctx) => ctx.reply('سلام! ربات در حال ساخت است 🛠'));

const app = new Hono();
app.get('/health', (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, port: config.PORT }, ({ port }) => {
  console.log(`HTTP server listening on :${port}`);
});

// Long polling for local development; production switches to a webhook in phase 5.
void bot.start({ onStart: ({ username }) => console.log(`Bot @${username} started`) });
