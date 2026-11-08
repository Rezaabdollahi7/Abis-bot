import type { MeResponse } from '@abis/shared';
import { useEffect, useState } from 'react';
import { ApiRequestError, apiFetch } from './api';
import { initData, telegramWebApp } from './telegram';

type State =
  | { kind: 'loading' }
  | { kind: 'outside-telegram' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; me: MeResponse };

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
      return (
        <>
          <h1>پنل ادمین</h1>
          <p>
            سلام {state.me.firstName} 👋 {state.me.isOwner && <span className="badge">مالک</span>}
          </p>
        </>
      );
  }
}
