import type { CartLine, Customer, Pickup } from './types';

/**
 * The mobile app hands card payments to the website's secure payment page, passing the order
 * in the URL. Nothing in it is trusted: the server re-checks and re-prices everything.
 */
export interface CheckoutHandoff {
  lines: CartLine[];
  customer: Customer;
  pickup: Pickup;
  notes?: string;
}

/** Custom URL scheme of the mobile app. */
export const APP_SCHEME = 'shawarmabay';

/** Where the payment page sends the customer back to in the app once the order is placed. */
export function appReturnUrl(orderId: string): string {
  return `${APP_SCHEME}://payment-complete?order=${encodeURIComponent(orderId)}`;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodeHandoff(handoff: CheckoutHandoff): string {
  return toBase64Url(JSON.stringify(handoff));
}

/** Returns the decoded payload, or null if it's malformed. Shapes are validated by the server. */
export function decodeHandoff(encoded: string): CheckoutHandoff | null {
  try {
    const value = JSON.parse(fromBase64Url(encoded));
    if (typeof value !== 'object' || value === null || !Array.isArray(value.lines)) return null;
    return value as CheckoutHandoff;
  } catch {
    return null;
  }
}
