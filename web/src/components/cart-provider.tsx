'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { priceCart, subtotalOf, type CartLine, type Menu, type PricedLine } from '@shawarma-bay/core';

export interface CartEntry extends CartLine {
  key: string;
}

interface CartContextValue {
  menu: Menu;
  entries: CartEntry[];
  /** Entries priced from the current menu; entries that no longer price are left out. */
  priced: (PricedLine & { key: string })[];
  subtotal: number;
  count: number;
  /** False until the saved cart has been read from this browser. */
  ready: boolean;
  add(line: CartLine): void;
  setQuantity(key: string, quantity: number): void;
  remove(key: string): void;
  clear(): void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'shawarma-bay-cart-v1';

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

function sameChoice(a: CartLine, b: CartLine) {
  return (
    a.itemId === b.itemId &&
    (a.note ?? '') === (b.note ?? '') &&
    a.modifierIds.length === b.modifierIds.length &&
    a.modifierIds.every((id) => b.modifierIds.includes(id))
  );
}

export function CartProvider({ menu, children }: { menu: Menu; children: ReactNode }) {
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as CartEntry[];
      if (Array.isArray(saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after hydration
        setEntries(saved.filter((e) => e && typeof e.itemId === 'string' && menu.items[e.itemId]));
      }
    } catch {
      // Storage can be unavailable (private browsing); start with an empty cart.
    }
    setReady(true);
  }, [menu]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Ignore; the cart still works for this visit.
    }
  }, [entries, ready]);

  const add = useCallback((line: CartLine) => {
    setEntries((prev) => {
      const match = prev.find((e) => sameChoice(e, line));
      if (match) {
        return prev.map((e) => (e === match ? { ...e, quantity: Math.min(20, e.quantity + line.quantity) } : e));
      }
      return [...prev, { ...line, key: newKey() }];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setEntries((prev) =>
      quantity <= 0
        ? prev.filter((e) => e.key !== key)
        : prev.map((e) => (e.key === key ? { ...e, quantity: Math.min(20, quantity) } : e)),
    );
  }, []);

  const remove = useCallback((key: string) => setEntries((prev) => prev.filter((e) => e.key !== key)), []);
  const clear = useCallback(() => setEntries([]), []);

  const priced = useMemo(
    () =>
      entries.flatMap((entry) => {
        try {
          return [{ ...priceCart(menu, [entry])[0], key: entry.key }];
        } catch {
          return [];
        }
      }),
    [entries, menu],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      menu,
      entries,
      priced,
      subtotal: subtotalOf(priced),
      count: priced.reduce((n, l) => n + l.quantity, 0),
      ready,
      add,
      setQuantity,
      remove,
      clear,
    }),
    [menu, entries, priced, ready, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
