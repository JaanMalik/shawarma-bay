import { formatTime } from './hours';
import { formatMoney } from './money';
import { restaurant } from './restaurant';
import { formatPhone } from './validate';
import type { OrderRequest, OrderSource, Pickup } from './types';

/**
 * Online orders are stored in Clover with a title and a note in the format below. The note
 * prints on the kitchen ticket, and the in-store order screen reads it back, so both sides
 * are kept in this one file.
 *
 *   ONLINE ORDER (web)
 *   PAY AT PICKUP
 *   Pickup: 7:45 PM
 *   Customer: Jaan Malik, (516) 555-1234
 *   Note: extra garlic sauce
 */

export const ONLINE_TITLE_PREFIX = 'Online';
const HEADER = 'ONLINE ORDER';
const PAID = 'PREPAID ONLINE';
const UNPAID = 'PAY AT PICKUP';

export function pickupLabel(pickup: Pickup, placedAt: Date): string {
  if (pickup.type === 'scheduled') return formatTime(pickup.time);
  const ready = new Date(placedAt.getTime() + restaurant.prepMinutes * 60_000);
  return `ASAP (about ${formatTime(ready)})`;
}

export function pickupTime(pickup: Pickup, placedAt: Date): string {
  return pickup.type === 'scheduled'
    ? pickup.time
    : new Date(placedAt.getTime() + restaurant.prepMinutes * 60_000).toISOString();
}

/** "Jaan M." */
export function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

export function orderTitle(order: Pick<OrderRequest, 'customer'>): string {
  return `${ONLINE_TITLE_PREFIX} · ${shortName(order.customer.name)}`;
}

export function orderNote(order: OrderRequest, placedAt: Date): string {
  const lines = [
    `${HEADER} (${order.source})`,
    order.payment.method === 'card' ? PAID : UNPAID,
    `Pickup: ${pickupLabel(order.pickup, placedAt)}`,
    `Customer: ${order.customer.name}, ${formatPhone(order.customer.phone)}`,
  ];
  if (order.payment.method === 'card' && order.payment.tip > 0) lines.push(`Tip: ${formatMoney(order.payment.tip)}`);
  if (order.notes) lines.push(`Note: ${order.notes.replace(/\s+/g, ' ')}`);
  return lines.join('\n');
}

export interface ParsedNote {
  online: boolean;
  source: OrderSource | 'unknown';
  paidOnline: boolean;
  pickupLabel?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

export function parseOrderNote(note: string | undefined | null): ParsedNote {
  const lines = (note ?? '').split('\n').map((l) => l.trim());
  const header = lines[0]?.match(/^ONLINE ORDER \((web|app)\)$/);
  const field = (label: string) =>
    lines.find((l) => l.startsWith(`${label}: `))?.slice(label.length + 2).trim() || undefined;
  const customer = field('Customer');
  const comma = customer?.lastIndexOf(', ') ?? -1;
  return {
    online: Boolean(header),
    source: (header?.[1] as OrderSource | undefined) ?? 'unknown',
    paidOnline: lines.includes(PAID),
    pickupLabel: field('Pickup'),
    customerName: customer && comma > 0 ? customer.slice(0, comma) : customer,
    customerPhone: customer && comma > 0 ? customer.slice(comma + 2) : undefined,
    notes: field('Note'),
  };
}
