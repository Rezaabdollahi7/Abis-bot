import { AUTH_SCHEME, type ApiError } from '@abis/shared';
import { initData } from './telegram';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | undefined,
  ) {
    super(`API ${status}: ${body?.error ?? 'unknown'}`);
  }
}

/** Calls the admin API with the Telegram initData attached. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `${AUTH_SCHEME} ${initData()}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as ApiError | undefined;
    throw new ApiRequestError(res.status, body);
  }
  return (await res.json()) as T;
}
