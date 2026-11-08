# Architecture

Product behaviour lives in [`IDEA.md`](IDEA.md); vocabulary in [`../GLOSSARY.md`](../GLOSSARY.md); the reasons behind lock-in choices in [`adr/`](adr/). This file is the technical shape. It describes the **target** layout — update it in the same PR whenever the code diverges.

## System overview

```
 Telegram clients ──► api.telegram.org ──webhook──► ┌──────────────── VPS (outside Iran) ───────────────┐
        │                                            │  Caddy (HTTPS, Let's Encrypt)                     │
        │  Mini App (admin)  ── HTTPS ─────────────► │    ├─ /bot/<secret>  → server (grammY webhook)    │
        │                                            │    ├─ /api/*         → server (Hono)              │
        │                                            │    └─ /*             → admin static build         │
        │                                            │  server (Node 22): bot + API + hourly jobs         │
        │                                            │  PostgreSQL 16                                    │
        │                                            │  nightly backup job → private Telegram channel    │
        └────────────────────────────────────────────┴───────────────────────────────────────────────────┘
```

One Node process (`apps/server`) hosts the bot webhook, the admin HTTP API and the background workers. They share the same domain modules and DB connection. Split into separate processes only when load proves it necessary.

## Repository layout (target)

```
apps/
  server/                 Node: bot + API + jobs
    src/
      modules/            domain modules — the business logic (deep modules, see below)
        catalog/          providers, products, variants, featured
        stock/            encrypted stock items, reservation, low-stock alerts
        wallet/           ledger, top-ups, adjustments, refunds
        orders/           purchase, delivery, manual queue, subscriptions, warranty
        tickets/          tickets and messages
        messaging/        broadcast, direct messages, admin notifications
        customers/        customers, ban, phone
        admins/           admins, owners, audit log
        settings/         runtime settings (bank cards, limits, toggles, texts)
      bot/                grammY composers: thin adapters calling modules
      api/                Hono routes for the Mini App: thin adapters calling modules
      jobs/               periodic jobs: reminders, password purge, backup
      db/                 Drizzle schema, migrations, client
      lib/                crypto, money, telegram helpers, config (zod-validated env)
  admin/                  React + Vite Telegram Mini App (admin panel)
packages/
  shared/                 types and zod schemas shared by server ↔ admin (API contract)
docs/                     IDEA, ARCHITECTURE, adr/
```

### Database conventions

- Each module declares its own tables in `modules/<name>/schema.ts`; `db/schema.ts` only re-exports them for the Drizzle client and drizzle-kit.
- Drizzle runs with `casing: 'snake_case'`. Migrations are generated into `apps/server/drizzle/` and applied automatically at server boot.
- Runtime settings are key → JSON rows validated by one zod schema in `modules/settings` (new setting = one line, no migration).

### The module rule

`bot/`, `api/` and `jobs/` are **adapters**: parse input, call one module function, render output. Every business rule (prices, balances, stock, state transitions, permissions) lives in `modules/`. A module exposes a small interface and hides its tables; other modules call that interface, never its tables. This keeps logic testable without Telegram and identical across bot buttons and panel buttons (an admin approving a top-up from a chat button and from the Mini App runs the same function).

## Data model (initial sketch)

Money is **integer Toman** (`bigint`), never float. Timestamps are `timestamptz` in UTC; display in Asia/Tehran (Jalali dates in UI).

| Table                 | Key columns                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customers`           | id, telegram_id (unique), first_name, username, phone, is_banned, created_at                                                                                                                   |
| `admins`              | id, telegram_id (unique), added_by, created_at — owners come from env, not this table                                                                                                          |
| `providers`           | id, name, emoji, sort, is_active                                                                                                                                                               |
| `products`            | id, provider_id, name, description, delivery_method (`link`/`ready_account`/`email_activation`), required_fields (jsonb), warranty_days, eta_minutes, is_featured, is_active                   |
| `variants`            | id, product_id, duration_days, price_toman, sold_count, is_active                                                                                                                              |
| `stock_items`         | id, variant_id, payload_encrypted, status (`available`/`reserved`/`sold`), order_id, created_at                                                                                                |
| `ledger_entries`      | id, customer_id, amount_toman (signed), kind (`topup`/`purchase`/`refund`/`adjustment`), ref_type, ref_id, reason, created_by_admin, created_at — **append-only**                              |
| `topups`              | id, customer_id, claimed_amount, approved_amount, receipt_file_id, receipt_file_unique_id, bank_card_id, status (`pending`/`approved`/`rejected`), reject_reason, handled_by, handled_at       |
| `orders`              | id, customer_id, variant_id, quantity, unit_price_toman, total_toman, status (`delivered`/`queued`/`rejected`), customer_input_encrypted, input_purge_at, handled_by, created_at, delivered_at |
| `subscriptions`       | id, order_id, starts_at, expires_at, reminded_at                                                                                                                                               |
| `tickets`             | id, customer_id, order_id?, topic, status (`open`/`awaiting_reply`/`closed`)                                                                                                                   |
| `ticket_messages`     | id, ticket_id, from_admin_id?, text, file_id, created_at                                                                                                                                       |
| `bank_cards`          | id, number, holder_name, is_active                                                                                                                                                             |
| `settings`            | key, value (jsonb)                                                                                                                                                                             |
| `audit_log`           | id, admin_telegram_id, action, entity_type, entity_id, data (jsonb), created_at                                                                                                                |
| `admin_notifications` | id, entity_type, entity_id, admin_telegram_id, chat_id, message_id — to edit everyone's copy after one admin acts                                                                              |

Wallet balance = `SUM(amount_toman) FROM ledger_entries WHERE customer_id = ?`. See [ADR-0003](adr/0003-wallet-as-ledger.md).

## Critical flows

### Approving a top-up (exactly once)

```sql
UPDATE topups SET status='approved', approved_amount=$amt, handled_by=$admin, handled_at=now()
WHERE id=$id AND status='pending' RETURNING *;
```

In one DB transaction: if a row returns → insert the `topup` ledger entry + audit log; else → someone already handled it, report who. Afterwards edit every admin's notification message from `admin_notifications`.

### Purchase

One DB transaction with `SELECT ... FOR UPDATE` on the customer row (serialises one customer's purchases):

1. Compute balance; reject if `< total`.
2. For stock-based products: claim `quantity` rows with `UPDATE stock_items SET status='sold', order_id=$o WHERE id IN (SELECT id FROM stock_items WHERE variant_id=$v AND status='available' LIMIT $q FOR UPDATE SKIP LOCKED)`.
3. Insert order (`delivered` if stock claimed, else `queued`), the negative `purchase` ledger entry, subscriptions.
4. After commit: send items to the customer / notify admins.

### Rejecting an order

Status transition `queued → rejected` guarded the same way as top-ups, plus a positive `refund` ledger entry in the same transaction.

### Duplicate receipt detection

Store Telegram's `file_unique_id` on every top-up; if a pending/approved top-up already has it, flag the new one in the admin notification.

## Mini App authentication

The admin panel sends Telegram `initData` on every request. The server validates its HMAC with the bot token (reject if `auth_date` is older than 24h), then checks the Telegram user id is an owner (env) or in `admins`. No passwords, no sessions of our own.

## Background jobs

An in-process hourly timer (`jobs/index.ts`), no queue library: one server instance is enough for this shop. Each job claims its rows with a guarded `UPDATE … RETURNING`, so an overlapping run can never send a reminder twice or touch a row twice. Revisit (e.g. pg-boss) only if the server is ever scaled to several instances.

| Job                                                         | Schedule        |
| ----------------------------------------------------------- | --------------- |
| Expiry reminders (3 days before)                            | hourly          |
| Purge customer-provided passwords (7 days after delivery)   | hourly          |
| Encrypted `pg_dump` to private backup channel               | nightly         |
| Broadcast sender (respects Telegram rate limits, ~25 msg/s) | on demand       |
| Low-stock alert                                             | after each sale |

## Security

- Sensitive payloads (stock items, customer passwords) encrypted with AES-256-GCM; key from env `ENCRYPTION_KEY`, never in DB or git.
- Webhook path contains a secret and Telegram's `secret_token` header is verified.
- Secrets only via env (`.env` on server, never committed). Config parsed and validated with zod at boot.
- Receipt images stay on Telegram (we store `file_id`), not on our disk.

## Telegram UI notes

- Bot API 9.4 button `style` (`primary`/`success`/`danger`) is used for colored buttons; older clients fall back to default buttons.
- `icon_custom_emoji_id` (logos on buttons) is **deferred** — likely requires the bot owner to have Telegram Premium. Verify in official docs before use.
- All customer-facing texts in Persian, kept in one place (`bot/texts.ts` with overrides from `settings`), never inline in handlers.
