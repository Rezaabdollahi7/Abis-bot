import { formatToman, toman } from '@abis/shared';

// Placeholder screen until Mini App auth and the dashboard land (ROADMAP phases 1 and 4).
export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>پنل ادمین</h1>
      <p>در حال ساخت… نمونه‌ی قیمت: {formatToman(toman(800_000))}</p>
    </main>
  );
}
