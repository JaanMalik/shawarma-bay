import 'server-only';

import {
  formatPhone,
  orderNote,
  pickupLabel,
  type OrderRequest,
  type OrderView,
  type Quote,
} from '@shawarma-bay/core';

/**
 * Demo mode keeps orders in this server's memory so the whole flow can be tried without a
 * Clover account. Orders vanish when the server restarts.
 */

interface DemoOrder {
  view: OrderView;
  /** The note Clover would print on the kitchen ticket. */
  ticketNote: string;
}

const store = globalThis as unknown as { __demoOrders?: Map<string, DemoOrder> };

function orders(): Map<string, DemoOrder> {
  if (!store.__demoOrders) {
    store.__demoOrders = new Map();
    seedSamples(store.__demoOrders);
  }
  return store.__demoOrders;
}

const ID_CHARS = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';

/** Random 13-character ID in the same style as Clover order IDs. */
function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(13));
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

export function saveDemoOrder(order: OrderRequest, quote: Quote, placedAt: Date): OrderView {
  const tip = order.payment.method === 'card' ? order.payment.tip : 0;
  const view: OrderView = {
    id: newId(),
    createdAt: placedAt.toISOString(),
    customerName: order.customer.name,
    customerPhone: formatPhone(order.customer.phone),
    pickupLabel: pickupLabel(order.pickup, placedAt),
    paidOnline: order.payment.method === 'card',
    source: order.source,
    ...(order.notes ? { notes: order.notes } : {}),
    lines: quote.lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      modifiers: l.modifiers.map((m) => m.name),
      ...(l.note ? { note: l.note } : {}),
      total: l.lineTotal,
    })),
    subtotal: quote.subtotal,
    tax: quote.tax,
    tip,
    total: quote.total + tip,
  };
  orders().set(view.id, { view, ticketNote: orderNote(order, placedAt) });
  return view;
}

export function getDemoOrder(id: string): OrderView | null {
  return orders().get(id)?.view ?? null;
}

export function listDemoOrders(sinceMs: number): OrderView[] {
  return [...orders().values()]
    .map((o) => o.view)
    .filter((v) => new Date(v.createdAt).getTime() >= sinceMs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function seedSamples(map: Map<string, DemoOrder>) {
  if (process.env.DEMO_SAMPLE_ORDERS === 'off') return;
  const now = Date.now();
  const samples: Omit<OrderView, 'id'>[] = [
    {
      createdAt: new Date(now - 6 * 60_000).toISOString(),
      customerName: 'Sample: Ayesha Khan',
      customerPhone: '(631) 555-0142',
      pickupLabel: 'ASAP',
      paidOnline: true,
      source: 'app',
      lines: [
        { name: 'Beef Chapli Kebab Platter', quantity: 2, modifiers: [], total: 2598 },
        { name: 'Hummus with Pita', quantity: 1, modifiers: [], total: 600 },
        { name: 'Can Soda (12 oz)', quantity: 2, modifiers: [], note: 'One Coke, one Sprite', total: 398 },
      ],
      subtotal: 3596,
      tax: 310,
      tip: 540,
      total: 4446,
    },
    {
      createdAt: new Date(now - 2 * 60_000).toISOString(),
      customerName: 'Sample: Mike Russo',
      customerPhone: '(516) 555-0199',
      pickupLabel: 'ASAP',
      paidOnline: false,
      source: 'web',
      notes: 'Extra white sauce please',
      lines: [
        { name: 'Customized Combo Platter', quantity: 1, modifiers: ['Chicken Shawarma', 'Masala Fish'], total: 1299 },
        { name: 'Chicken Shawarma Wrap', quantity: 1, modifiers: [], total: 1100 },
      ],
      subtotal: 2399,
      tax: 207,
      tip: 0,
      total: 2606,
    },
  ];
  for (const s of samples) {
    const view = { ...s, id: newId() };
    map.set(view.id, { view, ticketNote: '' });
  }
}
