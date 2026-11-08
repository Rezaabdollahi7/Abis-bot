# Abis (نام موقت)

فروشگاه تلگرامی اکانت‌های هوش مصنوعی — ربات فروش فارسی با کیف پول تومانی (کارت به کارت دستی) و پنل ادمین داخل Telegram Mini App.

> وضعیت: **مرحله‌ی طراحی** — هنوز کدی نوشته نشده. قدم بعدی: [فاز ۰ در ROADMAP](ROADMAP.md).

## سندها

| سند                                            | محتوا                                 | زبان            |
| ---------------------------------------------- | ------------------------------------- | --------------- |
| [`docs/IDEA.md`](docs/IDEA.md)                 | ایده و رفتار کامل محصول (مرجع اصلی)   | فارسی           |
| [`ROADMAP.md`](ROADMAP.md)                     | فازها و چک‌لیست نسخه‌ی ۱ و بعد از آن  | فارسی           |
| [`GLOSSARY.md`](GLOSSARY.md)                   | واژه‌نامه‌ی دامنه                     | English + فارسی |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | معماری، ساختار ریپو، مدل داده         | English         |
| [`RULES.md`](RULES.md)                         | قواعد کدنویسی، گیت، تست و امنیت       | English         |
| [`DEPLOY.md`](DEPLOY.md)                       | راه‌اندازی سرور، دامنه، ربات و deploy | English         |
| [`CLAUDE.md`](CLAUDE.md)                       | راهنمای Claude Code در این ریپو       | English         |
| [`docs/adr/`](docs/adr/)                       | تصمیم‌های معماری و دلیلشان            | English         |

## Stack

TypeScript · pnpm monorepo · grammY (bot) · Hono (API) · React + Vite (Mini App) · PostgreSQL + Drizzle · pg-boss (jobs) · Docker Compose + Caddy on a VPS outside Iran.

## Claude Code skills

اسکیل‌های [`mattpocock/skills`](https://github.com/mattpocock/skills) در `.claude/skills/` نصب شده‌اند (قفل نسخه در `skills-lock.json`). به‌روزرسانی:

```bash
npx skills@latest update -p -y
```
