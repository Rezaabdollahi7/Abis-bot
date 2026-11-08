// Contract between apps/server (Hono API) and apps/admin (Mini App).

/** Header the Mini App sends on every request: `Authorization: tma <initData>`. */
export const AUTH_SCHEME = 'tma';

export interface MeResponse {
  telegramId: number;
  firstName: string;
  isOwner: boolean;
}

export interface ApiError {
  error: 'unauthorized' | 'forbidden' | 'not_found' | 'invalid_input' | 'conflict';
  message?: string;
}
