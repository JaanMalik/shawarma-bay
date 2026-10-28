import { storage } from '../storage';

/** Cookies for the in-browser API (the order screen's sign-in), kept in browser storage. */

const KEY = 'shawarma-bay-demo-cookies';

function load(): Record<string, string> {
  try {
    const saved = JSON.parse(storage.get(KEY) ?? '{}') as unknown;
    return saved && typeof saved === 'object' ? (saved as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const jar = new Map(Object.entries(load()));
const save = () => storage.set(KEY, JSON.stringify(Object.fromEntries(jar)));

const cookieStore = {
  get(name: string) {
    const value = jar.get(name);
    return value === undefined ? undefined : { name, value };
  },
  has(name: string) {
    return jar.has(name);
  },
  set(name: string, value: string) {
    jar.set(name, value);
    save();
  },
  delete(name: string) {
    jar.delete(name);
    save();
  },
};

export async function cookies() {
  return cookieStore;
}

export async function headers() {
  return new Headers();
}
