import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { priceCart, subtotalOf, type CartLine, type Menu, type PricedLine } from '@shawarma-bay/core';

import { api, type AppConfig } from './api';

export interface CartEntry extends CartLine {
  key: string;
}

export interface SavedCustomer {
  name: string;
  phone: string;
}

interface StoreValue {
  menu: Menu | null;
  config: AppConfig | null;
  loadError: string | null;
  reload(): void;
  entries: CartEntry[];
  priced: (PricedLine & { key: string })[];
  subtotal: number;
  count: number;
  add(line: CartLine): void;
  setQuantity(key: string, quantity: number): void;
  clear(): void;
  customer: SavedCustomer;
  saveCustomer(c: SavedCustomer): void;
}

const StoreContext = createContext<StoreValue | null>(null);
const CART_KEY = 'cart-v1';
const CUSTOMER_KEY = 'customer-v1';

const sameChoice = (a: CartLine, b: CartLine) =>
  a.itemId === b.itemId &&
  (a.note ?? '') === (b.note ?? '') &&
  a.modifierIds.length === b.modifierIds.length &&
  a.modifierIds.every((id) => b.modifierIds.includes(id));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [restored, setRestored] = useState(false);
  const [customer, setCustomer] = useState<SavedCustomer>({ name: '', phone: '' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.menu(), api.config()])
      .then(([m, c]) => {
        if (cancelled) return;
        setMenu(m);
        setConfig(c);
        setLoadError(null);
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(CART_KEY), AsyncStorage.getItem(CUSTOMER_KEY)])
      .then(([cart, saved]) => {
        if (cart) setEntries(JSON.parse(cart));
        if (saved) setCustomer(JSON.parse(saved));
      })
      .catch(() => {})
      .finally(() => setRestored(true));
  }, []);

  useEffect(() => {
    if (restored) AsyncStorage.setItem(CART_KEY, JSON.stringify(entries)).catch(() => {});
  }, [entries, restored]);

  const add = useCallback((line: CartLine) => {
    setEntries((prev) => {
      const match = prev.find((e) => sameChoice(e, line));
      if (match) {
        return prev.map((e) => (e === match ? { ...e, quantity: Math.min(20, e.quantity + line.quantity) } : e));
      }
      return [...prev, { ...line, key: Math.random().toString(36).slice(2, 10) }];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setEntries((prev) =>
      quantity <= 0
        ? prev.filter((e) => e.key !== key)
        : prev.map((e) => (e.key === key ? { ...e, quantity: Math.min(20, quantity) } : e)),
    );
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const saveCustomer = useCallback((c: SavedCustomer) => {
    setCustomer(c);
    AsyncStorage.setItem(CUSTOMER_KEY, JSON.stringify(c)).catch(() => {});
  }, []);

  const priced = useMemo(
    () =>
      menu
        ? entries.flatMap((entry) => {
            try {
              return [{ ...priceCart(menu, [entry])[0], key: entry.key }];
            } catch {
              return [];
            }
          })
        : [],
    [entries, menu],
  );

  const value = useMemo<StoreValue>(
    () => ({
      menu,
      config,
      loadError,
      reload: () => setAttempt((n) => n + 1),
      entries,
      priced,
      subtotal: subtotalOf(priced),
      count: priced.reduce((n, l) => n + l.quantity, 0),
      add,
      setQuantity,
      clear,
      customer,
      saveCustomer,
    }),
    [menu, config, loadError, entries, priced, add, setQuantity, clear, customer, saveCustomer],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
