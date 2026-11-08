import type { MeResponse } from '@abis/shared';
import { useEffect, useState } from 'react';
import { ApiRequestError, apiFetch } from './api';
import { AuditPage } from './audit/AuditPage';
import { CatalogPage } from './catalog/CatalogPage';
import { CustomersPage } from './customers/CustomersPage';
import { OrdersPage } from './orders/OrdersPage';
import { SettingsPage } from './settings/SettingsPage';
import { TopupsPage } from './topups/TopupsPage';
import { initData, telegramWebApp } from './telegram';

type State =
  | { kind: 'loading' }
  | { kind: 'outside-telegram' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; me: MeResponse };

const tabs = [
  { id: 'topups', label: 'واریزها', Page: TopupsPage },
  { id: 'orders', label: 'سفارش‌ها', Page: OrdersPage },
  { id: 'customers', label: 'کاربران', Page: CustomersPage },
  { id: 'catalog', label: 'کاتالوگ', Page: CatalogPage },
  { id: 'settings', label: 'تنظیمات', Page: SettingsPage },
  { id: 'audit', label: 'تاریخچه', Page: AuditPage },
] as const;
type TabId = (typeof tabs)[number]['id'];

function Panel(props: { me: MeResponse }) {
  const [tab, setTab] = useState<TabId>('topups');
  const Page = tabs.find((t) => t.id === tab)?.Page ?? TopupsPage;
  return (
    <>
      <header className="top">
        <h1>پنل ادمین</h1>
        <span className="muted">
          {props.me.firstName} {props.me.isOwner && <span className="badge">مالک</span>}
        </span>
      </header>
      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <Page />
    </>
  );
}

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    telegramWebApp()?.ready();
    telegramWebApp()?.expand();
    if (!initData()) {
      setState({ kind: 'outside-telegram' });
      return;
    }
    apiFetch<MeResponse>('/me')
      .then((me) => setState({ kind: 'ready', me }))
      .catch((error: unknown) => {
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
          setState({ kind: 'denied' });
        } else {
          setState({ kind: 'error', message: String(error) });
        }
      });
  }, []);

  return <main className="page">{render(state)}</main>;
}

function render(state: State) {
  switch (state.kind) {
    case 'loading':
      return <p className="muted">در حال بارگذاری…</p>;
    case 'outside-telegram':
      return <p>این پنل فقط از داخل تلگرام باز می‌شود.</p>;
    case 'denied':
      return <p>⛔️ شما دسترسی ادمین ندارید.</p>;
    case 'error':
      return <p>خطا در ارتباط با سرور: {state.message}</p>;
    case 'ready':
      return <Panel me={state.me} />;
  }
}
