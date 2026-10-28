import { useSyncExternalStore } from 'react';

/**
 * The app opens the website's payment page with openAuthSessionAsync. In the demo that page opens
 * in a sheet inside the phone (see app/in-app-browser.tsx) and the session finishes when the
 * website hands back to the app through openApp().
 */

export type AuthSessionResult = { type: 'success'; url: string } | { type: 'cancel' } | { type: 'dismiss' };

export interface AuthSession {
  id: number;
  url: string;
  redirectUrl: string;
}

let current: (AuthSession & { resolve(result: AuthSessionResult): void }) | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function finish(result: AuthSessionResult) {
  const session = current;
  current = null;
  listeners.forEach((l) => l());
  session?.resolve(result);
}

export function openAuthSessionAsync(url: string, redirectUrl = ''): Promise<AuthSessionResult> {
  if (current) finish({ type: 'dismiss' });
  return new Promise((resolve) => {
    current = { id: nextId++, url, redirectUrl, resolve };
    listeners.forEach((l) => l());
  });
}

export async function openBrowserAsync(url: string) {
  window.open(url, '_blank', 'noopener');
  return { type: 'opened' as const };
}

export function dismissBrowser() {
  finish({ type: 'dismiss' });
}

export function dismissAuthSession() {
  finish({ type: 'dismiss' });
}

export function maybeCompleteAuthSession() {
  return { type: 'failed' as const, message: 'Not used in the demo.' };
}

/** The website handing control back to the app (shawarmabay://payment-complete?order=…). */
export function completeAuthSession(url: string) {
  if (current && url.startsWith(current.redirectUrl)) finish({ type: 'success', url });
}

export function cancelAuthSession() {
  finish({ type: 'cancel' });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuthSession(): AuthSession | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
