import type { ApiError } from '@abis/shared';
import { authorizationHeader } from './auth';

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
  const auth = authorizationHeader();
  if (auth) headers.set('Authorization', auth);
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as ApiError | undefined;
    throw new ApiRequestError(res.status, body);
  }
  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Like apiFetch but returns the raw body (e.g. a receipt image). */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const res = await fetch(`/api${path}`, {
    headers: { Authorization: authorizationHeader() ?? '' },
  });
  if (!res.ok) throw new ApiRequestError(res.status, undefined);
  return res.blob();
}
