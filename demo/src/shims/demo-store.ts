import { formatPhone, pickupLabel, type OrderRequest, type OrderView, type Quote } from '@shawarma-bay/core';

import { sharedOrders } from '../mock/shared-orders';

/**
 * Demo-mode orders, as in web/src/server/demo-store.ts, but kept in the demo's shared order list
 * so they reach the order screen on other devices. The two sample orders stay on each device.
 */

const ID_CHARS = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';

/** Random 13-character ID in the same style as Clover order IDs. */
function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(13));
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

export const SAMPLE_ORDER_IDS = ['DEMOSAMPLE5YC2', 'DEMOSAMPLERRS3'];

const samples = new Map<string, OrderView>();

function seedSamples() {
  const now = Date.now();
  const list: OrderView[] = [
    {
      id: SAMPLE_ORDER_IDS[0],
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
      id: SAMPLE_ORDER_IDS[1],
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
  for (const order of list) samples.set(order.id, order);
}
seedSamples();

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
  sharedOrders.save(view);
  return view;
}

export function getDemoOrder(id: string): OrderView | null {
  return samples.get(id) ?? sharedOrders.get(id);
}

export function listDemoOrders(sinceMs: number): OrderView[] {
  return [...samples.values(), ...sharedOrders.list()]
    .filter((v) => new Date(v.createdAt).getTime() >= sinceMs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
