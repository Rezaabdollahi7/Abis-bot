# TypeScript monorepo with a single server process

We use one pnpm monorepo in TypeScript: `apps/server` (grammY bot + Hono API + hourly jobs in one Node process), `apps/admin` (React Mini App) and `packages/shared` (API contract). One language end to end lets the two-person team share types and zod schemas between bot, API and panel; one process keeps deployment to a single container. Python (aiogram + FastAPI) was considered and rejected because the admin panel is React anyway.
