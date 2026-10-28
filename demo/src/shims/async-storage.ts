import { storage } from '../storage';

/** The app's saved cart and details, kept in this browser (and in memory if storage is blocked). */

const PREFIX = 'shawarma-bay-app:';
const memory = new Map<string, string>();

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return storage.get(PREFIX + key) ?? memory.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    memory.set(key, value);
    storage.set(PREFIX + key, value);
  },
  async removeItem(key: string): Promise<void> {
    memory.delete(key);
    storage.remove(PREFIX + key);
  },
  async multiGet(keys: string[]): Promise<[string, string | null][]> {
    return Promise.all(keys.map(async (k) => [k, await AsyncStorage.getItem(k)] as [string, string | null]));
  },
  async multiSet(pairs: [string, string][]): Promise<void> {
    await Promise.all(pairs.map(([k, v]) => AsyncStorage.setItem(k, v)));
  },
};

/** Forgets the app's cart and saved details (the demo's reset). */
export function clearAppStorage() {
  for (const key of storage.keys()) if (key.startsWith(PREFIX)) storage.remove(key);
  memory.clear();
}

export default AsyncStorage;
