import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createApi } from './api/index.js';
import { createBot } from './bot/index.js';
import { connectDb, runMigrations } from './db/client.js';
import { createCipher } from './lib/cipher.js';
import { startJobs } from './jobs/index.js';
import { loadConfig } from './lib/config.js';

const config = loadConfig();
const cipher = createCipher(config.ENCRYPTION_KEY);

const { db } = connectDb(config.DATABASE_URL);
await runMigrations(db);

const bot = createBot({ db, cipher, config });

const app = new Hono();
app.get('/health', (c) => c.json({ ok: true }));
app.route('/api', createApi({ db, telegram: bot.api, cipher, config }));

serve({ fetch: app.fetch, port: config.PORT }, ({ port }) => {
  console.log(`HTTP server listening on :${port}`);
});

startJobs(bot.api, db);

// Long polling for local development; production switches to a webhook in phase 5.
void bot.start({ onStart: ({ username }) => console.log(`Bot @${username} started`) });
