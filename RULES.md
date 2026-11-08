# Rules

Binding rules for everyone (humans and Claude) writing code here. A PR that breaks one needs an explicit reason in its description.

## Money and data integrity

1. **Money is integer Toman** (`bigint` in DB, `bigint`/branded `Toman` type in TS). No floats, no USD/USDT anywhere.
2. **Balances come only from the ledger.** Never store or `UPDATE` a balance. Every change is a new `ledger_entries` row; manual changes are `adjustment` entries with a non-empty reason.
3. **Every state transition is guarded** in SQL (`... WHERE id=$1 AND status='pending' RETURNING *`) and runs in one DB transaction together with its ledger entry and audit-log row. Zero rows returned means "already handled" — report it, never retry blindly.
4. **Every admin action writes an audit-log row** (admin, action, entity, data).
5. **Prices are frozen on the order** at purchase time.

## Security

6. **Secrets live only in env.** `.env*` is git-ignored (except `.env.example` with placeholders). Never log tokens, card numbers, stock payloads or customer passwords.
7. **Stock payloads and customer passwords are encrypted** (AES-256-GCM via `lib/crypto`) before they touch the DB; decrypt only at the moment of delivery/display to an admin.
8. **Every Mini App request validates `initData`** and checks admin/owner status server-side. The client never decides permissions.
9. **Validate all input with zod** at the adapter boundary (bot messages, API bodies, env).
10. **Banned customers** are checked in one middleware, not per handler.

## Code structure

11. **Business logic lives in `apps/server/src/modules/`.** Bot handlers, API routes and jobs are thin adapters: parse → call a module → render. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
12. A module's tables are private to it; other modules use its exported functions.
13. **Use the words in [`GLOSSARY.md`](GLOSSARY.md)** for names in code, DB and UI copy (`topup`, not `deposit`; `variant`, not `plan`). New domain term → add it to the glossary in the same PR.
14. **Customer-facing text is Persian** and lives in one texts file; code, identifiers, comments, commits and technical docs are English.
15. TypeScript `strict`; no `any`, no non-null `!` without a comment explaining why it is safe.
16. Times stored in UTC; shown to people in Asia/Tehran with Jalali dates.

## Testing

17. **Every module function that moves money or stock has tests**, including the concurrent case (two approvals of one top-up → exactly one ledger entry).
18. Module tests run against a real PostgreSQL (Docker), not mocks of the DB.
19. Bug fix = a failing test first, then the fix.

## Git and PRs

20. `main` is always deployable. Work on `feat/<name>`, `fix/<name>`, `chore/<name>` branches; one roadmap item per PR.
21. Conventional Commits: `feat: …`, `fix: …`, `chore: …`, `docs: …`, `refactor: …`, `test: …`.
22. CI (lint + typecheck + test) must be green before merge. Never skip or disable a test to get green.
23. A PR that changes behaviour updates the docs it contradicts (`IDEA.md`, `ARCHITECTURE.md`, `GLOSSARY.md`, `ROADMAP.md` checkbox) in the same PR.
24. Hard-to-reverse decisions get an ADR in `docs/adr/`.
25. Development uses the **test bot and a local DB**; nothing is tried on the production bot.

## Database

26. Schema changes only through Drizzle migrations committed to git; never edit an applied migration.
27. Migrations must be safe to run on a live DB with data (add columns nullable or with defaults; backfill separately).
