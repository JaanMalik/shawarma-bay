import type { CartLine, Menu, OrderView, Quote, WeeklyHours } from '@shawarma-bay/core';

/**
 * The app talks to the website's API, which talks to Clover. Set EXPO_PUBLIC_API_URL to the
 * website's address (for example https://order.shawarmabay.com); on a phone in development,
 * use your computer's LAN address instead of localhost.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export interface AppConfig {
  demo: boolean;
  onlinePayments: boolean;
  payAtPickup: boolean;
  orderingHours: WeeklyHours;
  hours: WeeklyHours;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error('Could not reach Shawarma Bay. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.');
  return data;
}

export const api = {
  menu: () => call<Menu>('/api/menu'),
  config: () => call<AppConfig>('/api/config'),
  quote: (lines: CartLine[]) => call<Quote>('/api/quote', { method: 'POST', body: JSON.stringify({ lines }) }),
  placeOrder: (body: unknown) =>
    call<{ order: OrderView }>('/api/orders', { method: 'POST', body: JSON.stringify(body) }),
  order: (id: string) => call<{ order: OrderView }>(`/api/orders/${encodeURIComponent(id)}`),
};
