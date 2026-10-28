import type { OrderView } from '@shawarma-bay/core';

/**
 * Orders placed in the demo. They are kept on this page, and when the page runs as a claude.ai
 * Artifact for someone signed in, also in the Artifact's shared database, so an order placed on a
 * phone shows up on the order screen open on an iPad or laptop.
 */

interface DbDoc {
  id: string;
  data(): Record<string, unknown> | undefined;
}
interface DbCollection {
  doc(id: string): { set(data: Record<string, unknown>): Promise<void>; delete(): Promise<void> };
  orderBy(field: string, dir?: 'asc' | 'desc'): DbCollection;
  limit(n: number): DbCollection;
  get(): Promise<{ docs: DbDoc[] }>;
  onSnapshot(
    next: (snap: { docChanges(): { type: 'added' | 'modified' | 'removed'; doc: DbDoc }[] }) => void,
    error?: (e: { code: string }) => void,
  ): () => void;
}
interface Db {
  collection(path: string): DbCollection;
}
declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

export type SyncState = 'connecting' | 'shared' | 'local';

const COLLECTION = 'orders';
const orders = new Map<string, OrderView>();
const listeners = new Set<() => void>();
let db: Db | null = null;
let canWrite = true;
let sync: SyncState = 'connecting';
let version = 0;

function changed() {
  version++;
  listeners.forEach((l) => l());
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isMoney = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Orders in the shared database are written by other viewers, so check their shape first. */
function toOrder(id: string, data: Record<string, unknown> | undefined): OrderView | null {
  if (!data || !/^[A-Z0-9]{8,20}$/.test(id)) return null;
  const { createdAt, customerName, customerPhone, pickupLabel, paidOnline, source, notes, lines, subtotal, tax, tip, total } = data;
  if (!isString(createdAt) || Number.isNaN(Date.parse(createdAt)) || !isString(customerName) || !isString(pickupLabel)) return null;
  if (typeof paidOnline !== 'boolean' || (source !== 'web' && source !== 'app') || !Array.isArray(lines)) return null;
  if (![subtotal, tax, tip, total].every(isMoney)) return null;
  const cleanLines = lines.flatMap((l: unknown) => {
    if (!l || typeof l !== 'object') return [];
    const { name, quantity, modifiers, note, total: lineTotal } = l as Record<string, unknown>;
    if (!isString(name) || !isMoney(quantity) || !isMoney(lineTotal) || !Array.isArray(modifiers)) return [];
    return [{ name, quantity, modifiers: modifiers.filter(isString), ...(isString(note) ? { note } : {}), total: lineTotal }];
  });
  return {
    id,
    createdAt,
    customerName,
    ...(isString(customerPhone) ? { customerPhone } : {}),
    pickupLabel,
    paidOnline,
    source,
    ...(isString(notes) ? { notes } : {}),
    lines: cleanLines,
    subtotal: subtotal as number,
    tax: tax as number,
    tip: tip as number,
    total: total as number,
  };
}

export const sharedOrders = {
  save(order: OrderView) {
    orders.set(order.id, order);
    changed();
    if (db && canWrite) {
      db.collection(COLLECTION)
        .doc(order.id)
        .set({ ...order })
        .catch((err: { code?: string }) => {
          // Viewers who can only look at the Artifact keep their orders on their own device.
          if (err?.code === 'invalid_argument') canWrite = false;
          console.warn('Could not share the demo order', err);
        });
    }
  },
  get(id: string): OrderView | null {
    return orders.get(id) ?? null;
  },
  list(): OrderView[] {
    return [...orders.values()];
  },
  /** Removes the test orders (on every device when they are shared), keeping the given ones. */
  async clear(keep: string[] = []) {
    for (const id of [...orders.keys()]) if (!keep.includes(id)) orders.delete(id);
    changed();
    if (!db || !canWrite) return;
    const collection = db.collection(COLLECTION);
    const { docs } = await collection.limit(1000).get();
    for (const doc of docs) await collection.doc(doc.id).delete();
  },
  syncState(): SyncState {
    return sync;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  version: () => version,
};

/** Joins the Artifact's shared database when the page runs on claude.ai. */
export async function connectSharedOrders() {
  try {
    const handle = window.claude?.use ? ((await window.claude.use('db')) as Db | null) : null;
    if (!handle) {
      sync = 'local';
      changed();
      return;
    }
    db = handle;
    db.collection(COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .onSnapshot(
        (snap) => {
          for (const change of snap.docChanges()) {
            const { id } = change.doc;
            if (change.type === 'removed') {
              orders.delete(id);
              continue;
            }
            const order = toOrder(id, change.doc.data());
            if (order) orders.set(id, order);
          }
          sync = 'shared';
          changed();
        },
        () => {
          sync = 'local';
          changed();
        },
      );
  } catch {
    sync = 'local';
    changed();
  }
}
