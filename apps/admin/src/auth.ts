import { AUTH_SCHEME, type LoginExchangeResponse, SESSION_SCHEME } from '@abis/shared';
import { initData } from './telegram';

const SESSION_KEY = 'abis.panelSession';

function readSession(): string | undefined {
  try {
    return localStorage.getItem(SESSION_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
}

/** Authorization header: Telegram initData inside the Mini App, else the browser session. */
export function authorizationHeader(): string | undefined {
  const data = initData();
  if (data) return `${AUTH_SCHEME} ${data}`;
  const session = readSession();
  return session ? `${SESSION_SCHEME} ${session}` : undefined;
}

/**
 * If the page was opened from a /panel link (?login=…), trade the one-time token
 * for a session and remove it from the address bar. Returns false if the link was bad.
 */
export async function completeLinkLogin(): Promise<boolean> {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('login');
  if (!token) return true;
  url.searchParams.delete('login');
  window.history.replaceState(null, '', url.toString());
  const res = await fetch('/api/auth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return false;
  const { sessionToken } = (await res.json()) as LoginExchangeResponse;
  try {
    localStorage.setItem(SESSION_KEY, sessionToken);
  } catch {
    return false;
  }
  return true;
}
