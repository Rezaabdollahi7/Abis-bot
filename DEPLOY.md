# Deploy

How to take the bot from zero to production. The compose/Docker files referenced here are created in **Phase 5** of [`ROADMAP.md`](ROADMAP.md); until then this is the plan. Keep this file in sync with them.

Why the server must be outside Iran: [ADR-0002](docs/adr/0002-vps-outside-iran.md).

## 1. Things to obtain

| Item                      | Where                                                                                                                | Cost         | When                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------ |
| Dev bot token             | `@BotFather` → `/newbot`                                                                                             | free         | Phase 0                        |
| Prod bot token            | `@BotFather` → `/newbot`                                                                                             | free         | Phase 0 (reserve the username) |
| Public channel            | Telegram                                                                                                             | free         | Phase 0                        |
| Private backup channel    | Telegram (owners + prod bot as admin)                                                                                | free         | Phase 0                        |
| Owners' Telegram user ids | `@userinfobot`                                                                                                       | free         | Phase 0                        |
| VPS **outside Iran**      | ParsVDS, Germany/Netherlands location, Ubuntu 24.04, ≥2 vCPU, ≥2 GB RAM, ≥40 GB disk                                 | paid, Toman  | Phase 5                        |
| Domain                    | IRNIC (`.ir`)                                                                                                        | paid         | Phase 5                        |
| DNS hosting               | the VPS provider's DNS panel or ArvanCloud DNS (IRNIC only delegates nameservers) — confirm availability when buying | usually free | Phase 5                        |
| HTTPS certificate         | Let's Encrypt, automatic via Caddy                                                                                   | free         | Phase 5                        |

## 2. Environment variables

Defined in `.env.example` (source of truth). On the server, copy to `.env` and fill in. Never commit `.env`.

| Variable             | Meaning                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`           | `production` on the server                                                                                                 |
| `BOT_TOKEN`          | prod bot token                                                                                                             |
| `WEBHOOK_SECRET`     | random string; used in the webhook path and Telegram `secret_token`                                                        |
| `PUBLIC_URL`         | `https://<domain>`                                                                                                         |
| `OWNER_TELEGRAM_IDS` | comma-separated user ids of the two owners                                                                                 |
| `CHANNEL_ID`         | public channel `@username` or id (for forced join)                                                                         |
| `BACKUP_CHANNEL_ID`  | private backup channel id                                                                                                  |
| `DATABASE_URL`       | `postgres://abis:<password>@db:5432/abis`                                                                                  |
| `POSTGRES_PASSWORD`  | DB password                                                                                                                |
| `ENCRYPTION_KEY`     | 32 random bytes, base64 — **losing it makes stock and backups unreadable; store a copy in both owners' password managers** |
| `BACKUP_PASSPHRASE`  | passphrase for encrypting nightly dumps; store with the key                                                                |
| `HTTPS_PROXY`        | optional; send Bot API requests through this proxy (not needed on a server outside Iran)                                   |

Generate secrets:

```bash
openssl rand -base64 32
```

## 3. One-time server setup

SSH in as root (IP and password come from ParsVDS), then:

```bash
adduser deploy && usermod -aG sudo deploy
```

```bash
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh
```

Disable password login (`PasswordAuthentication no` in `/etc/ssh/sshd_config`, then `systemctl restart ssh`) **after** confirming you can log in as `deploy` with your key.

Firewall:

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

Docker:

```bash
curl -fsSL https://get.docker.com | sh && usermod -aG docker deploy
```

## 4. DNS

At IRNIC set the domain's nameservers to your DNS host, then create an `A` record `@ → <server IP>`. Wait until this returns the server IP:

```bash
dig +short <domain>
```

## 5. First deploy

As `deploy`:

```bash
git clone https://github.com/Rezaabdollahi7/Abis-bot.git ~/abis && cd ~/abis && cp .env.example .env
```

Fill `.env`, then:

```bash
docker compose up -d --build
```

The server container runs migrations at boot and registers the webhook (`PUBLIC_URL/bot/<WEBHOOK_SECRET>`). Caddy obtains the certificate automatically. Check:

```bash
docker compose ps && docker compose logs -f server
```

## 6. BotFather configuration (prod bot)

- `/setdescription`, `/setabouttext`, `/setuserpic` — Persian texts and logo.
- `/setcommands` → `start - شروع`
- Admin work happens in the chat (`/admin`); the web panel opens in a normal browser through `/panel` (needs `PUBLIC_URL`). Optional: `/newapp` (or **Bot Settings → Configure Mini App**) → URL `https://<domain>/` for admins whose Telegram loads Mini Apps; non-admins see "access denied".
- Add the prod bot as **admin of the public channel** (needed to check membership for forced join) and of the **backup channel**.

## 7. Updating

```bash
cd ~/abis && git pull && docker compose up -d --build
```

Only deploy commits that are on `main` with green CI.

## 8. Backups

- Nightly job dumps the DB, encrypts it with `BACKUP_PASSPHRASE`, and posts it to the backup channel.
- **Test a restore at launch and once a month** on a local machine:

```bash
gpg --decrypt backup.sql.gpg | docker compose exec -T db psql -U abis abis
```

## 9. Rollback

```bash
git checkout <previous-good-commit> && docker compose up -d --build
```

Migrations are forward-only; if a bad migration ran, fix forward with a new migration or restore the last backup.
