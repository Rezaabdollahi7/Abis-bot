import type { MeResponse } from '@abis/shared';
import { useEffect, useState } from 'react';
import { ApiRequestError, apiFetch } from './api';
import { AuditPage } from './audit/AuditPage';
import { BroadcastPage } from './broadcast/BroadcastPage';
import { CatalogPage } from './catalog/CatalogPage';
import { DashboardPage } from './dashboard/DashboardPage';
import { CustomersPage } from './customers/CustomersPage';
import { OrdersPage } from './orders/OrdersPage';
import { SettingsPage } from './settings/SettingsPage';
import { TicketsPage } from './tickets/TicketsPage';
import { TopupsPage } from './topups/TopupsPage';
import { authorizationHeader, clearSession, completeLinkLogin } from './auth';
import { initData, telegramWebApp } from './telegram';

type State =
  | { kind: 'loading' }
  | { kind: 'outside-telegram' }
  | { kind: 'link-expired' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; me: MeResponse };

const tabs = [
  { id: 'dashboard', label: 'داشبورد', Page: DashboardPage },
  { id: 'topups', label: 'واریزها', Page: TopupsPage },
  { id: 'orders', label: 'سفارش‌ها', Page: OrdersPage },
  { id: 'tickets', label: 'تیکت‌ها', Page: TicketsPage },
  { id: 'customers', label: 'کاربران', Page: CustomersPage },
  { id: 'broadcast', label: 'پیام همگانی', Page: BroadcastPage },
  { id: 'catalog', label: 'کاتالوگ', Page: CatalogPage },
  { id: 'settings', label: 'تنظیمات', Page: SettingsPage },
  { id: 'audit', label: 'تاریخچه', Page: AuditPage },
] as const;
type TabId = (typeof tabs)[number]['id'];

function Panel(props: { me: MeResponse }) {
  const [tab, setTab] = useState<TabId>('dashboard');
  const Page = tabs.find((t) => t.id === tab)?.Page ?? DashboardPage;
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
      <Page goTo={(id: string) => setTab(id as TabId)} />
    </>
  );
}

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    telegramWebApp()?.ready();
    telegramWebApp()?.expand();
    void (async () => {
      const linkOk = await completeLinkLogin();
      if (!authorizationHeader()) {
        setState({ kind: linkOk ? 'outside-telegram' : 'link-expired' });
        return;
      }
      try {
        setState({ kind: 'ready', me: await apiFetch<MeResponse>('/me') });
      } catch (error) {
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
          if (!initData()) {
            clearSession();
            setState({ kind: error.status === 401 ? 'link-expired' : 'denied' });
          } else {
            setState({ kind: 'denied' });
          }
        } else {
          setState({ kind: 'error', message: String(error) });
        }
      }
    })();
  }, []);

  return <main className="page">{render(state)}</main>;
}

function render(state: State) {
  switch (state.kind) {
    case 'loading':
      return <p className="muted">در حال بارگذاری…</p>;
    case 'outside-telegram':
      return <p>برای ورود، در ربات دستور /panel را بزنید و لینک ورود را باز کنید.</p>;
    case 'link-expired':
      return <p>⏱ لینک ورود منقضی یا استفاده‌شده است. در ربات دوباره /panel بزنید.</p>;
    case 'denied':
      return <p>⛔️ شما دسترسی ادمین ندارید.</p>;
    case 'error':
      return <p>خطا در ارتباط با سرور: {state.message}</p>;
    case 'ready':
      return <Panel me={state.me} />;
  }
}
