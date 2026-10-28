'use client';

import { useEffect, useState } from 'react';

import type { CartLine, OrderView, Quote } from '@shawarma-bay/core';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  } catch {
    throw new Error('Could not reach the restaurant. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.');
  return data;
}

export function placeOrder(body: unknown) {
  return call<{ order: OrderView }>('/api/orders', { method: 'POST', body: JSON.stringify(body) });
}

export function fetchOrder(id: string) {
  return call<{ order: OrderView }>(`/api/orders/${encodeURIComponent(id)}`);
}

/** Server-calculated totals (Clover works out the tax), refreshed as the cart changes. */
export function useQuote(lines: CartLine[]) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(lines);

  useEffect(() => {
    const parsed = JSON.parse(key) as CartLine[];
    if (parsed.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      call<Quote>('/api/quote', { method: 'POST', body: JSON.stringify({ lines: parsed }) })
        .then((q) => {
          if (cancelled) return;
          setQuote(q);
          setError(null);
        })
        .catch((e: Error) => {
          if (cancelled) return;
          setQuote(null);
          setError(e.message);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  return { quote: lines.length === 0 ? null : quote, error: lines.length === 0 ? null : error };
}
