# CLAUDE.md

Abis (working name): a Persian Telegram shop selling AI-service subscriptions, paid from a Toman wallet topped up by manual card-to-card transfer, with an admin panel as a Telegram Mini App.

## Your role

You write all the code; the owner reviews PRs and tests on Telegram. Work through [`ROADMAP.md`](ROADMAP.md) one item per PR, keep each PR scoped to its item, and when a request conflicts with the docs below, point at the conflict before acting.

## Read before working

- **Product behaviour** → [`docs/IDEA.md`](docs/IDEA.md) (Persian). The source of truth for what the shop does.
- **Rules** → [`RULES.md`](RULES.md). Binding for every change: money, security, structure, tests, git.
- **Architecture, layout, data model, critical flows** → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- **Vocabulary** → [`GLOSSARY.md`](GLOSSARY.md). Name things with these words; flag drift.
- **Why a lock-in choice was made** → [`docs/adr/`](docs/adr/).
- **What to build next** → [`ROADMAP.md`](ROADMAP.md) (Persian).
- **Server, domain, BotFather, deploy** → [`DEPLOY.md`](DEPLOY.md).

## Load-bearing invariants

The mistakes that cost real money, kept here because every code change can touch them:

- Wallet balance = sum of the append-only ledger; money is integer Toman.
- Every money/stock state change is a guarded `WHERE status=...` transition in one DB transaction with its ledger entry and audit-log row: exactly once, even with two admins clicking together.
- Stock payloads and customer passwords are encrypted at rest.
- Business logic lives in `apps/server/src/modules/`; bot handlers, API routes and jobs stay thin adapters.

## Language

Customer- and admin-facing UI text: Persian. Code, comments, commits, technical docs: English. Reply to the owners in Persian unless they write in English.

## Commands

Root `package.json` scripts are the source of truth. Before declaring work done, run the same gate as CI: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

Tests that touch the DB use `useTestDb()` from `apps/server/src/test/db.ts` against a real PostgreSQL (`TEST_DATABASE_URL`, default `abis_test` on localhost; `pnpm dev:db` creates it). Bot handler tests use `createTestBot()` (`apps/server/src/test/bot.ts`) and `seedTestCatalog()` (`test/fixtures.ts`). Local sample data: `pnpm --filter @abis/server db:seed`. After changing a module's `schema.ts`, run `pnpm --filter @abis/server db:generate` and commit the new migration in `apps/server/drizzle/`.

Workspace packages: `apps/server` (bot + API), `apps/admin` (Mini App), `packages/shared` (shared types; consumed from source via the `development`/`types` export conditions, from `dist` at runtime).

## Skills

Project skills from `mattpocock/skills` are in `.claude/skills/`. Useful here: `grilling` to stress-test a plan, `tdd` for money/stock logic, `domain-modeling` when terms change, `code-review` before merging, `diagnosing-bugs` for hard bugs.
