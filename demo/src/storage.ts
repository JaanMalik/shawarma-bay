/** Browser storage that never throws: it can be blocked in private windows and page previews. */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not kept; the demo still works for this visit.
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  },
  keys(): string[] {
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  },
};
