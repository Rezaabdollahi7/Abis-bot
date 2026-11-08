// Minimal typing for the Telegram WebApp script loaded in index.html.
interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function telegramWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

/** Signed launch data; empty when the page is opened outside Telegram. */
export function initData(): string {
  return telegramWebApp()?.initData ?? '';
}
