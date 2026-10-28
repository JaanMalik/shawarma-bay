import { isAcceptingOrders, minutesUntilClose } from './hours';
import { LIMITS } from './pricing';
import { restaurant, type WeeklyHours } from './restaurant';
import type { CartLine, Customer, OrderRequest, PaymentChoice, Pickup } from './types';

export class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, field: string, max: number, required = true): string | undefined {
  if (v === undefined || v === null || v === '') {
    if (required) throw new RequestError(`Missing ${field}.`);
    return undefined;
  }
  if (typeof v !== 'string') throw new RequestError(`Invalid ${field}.`);
  const trimmed = v.trim();
  if (required && !trimmed) throw new RequestError(`Missing ${field}.`);
  if (trimmed.length > max) throw new RequestError(`${field[0].toUpperCase()}${field.slice(1)} is too long.`);
  return trimmed || undefined;
}

/** Returns 10 digits for a US phone number, or null. */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}

export function formatPhone(digits: string): string {
  const d = normalizePhone(digits) ?? digits;
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : digits;
}

export function parseCartLines(v: unknown): CartLine[] {
  if (!Array.isArray(v)) throw new RequestError('Invalid cart.');
  if (v.length > LIMITS.maxLines) throw new RequestError('That order is too large to place online. Please call us.');
  return v.map((raw) => {
    if (!isRecord(raw)) throw new RequestError('Invalid cart.');
    const itemId = str(raw.itemId, 'item', 64)!;
    const quantity = raw.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity)) throw new RequestError('Invalid quantity.');
    const modifierIds = raw.modifierIds ?? [];
    if (!Array.isArray(modifierIds) || modifierIds.some((m) => typeof m !== 'string' || m.length > 64)) {
      throw new RequestError('Invalid options.');
    }
    const note = str(raw.note, 'item note', LIMITS.maxItemNote, false);
    return { itemId, quantity, modifierIds: modifierIds as string[], ...(note ? { note } : {}) };
  });
}

function parseCustomer(v: unknown): Customer {
  if (!isRecord(v)) throw new RequestError('Missing your name and phone number.');
  const name = str(v.name, 'name', 60)!;
  const phone = normalizePhone(str(v.phone, 'phone number', 30)!);
  if (!phone) throw new RequestError('Enter a 10-digit US phone number.');
  return { name, phone };
}

function parsePickup(v: unknown, now: Date, hours: WeeklyHours): Pickup {
  if (!isRecord(v) || v.type === 'asap') return { type: 'asap' };
  if (v.type !== 'scheduled' || typeof v.time !== 'string') throw new RequestError('Invalid pickup time.');
  const at = new Date(v.time);
  if (Number.isNaN(at.getTime())) throw new RequestError('Invalid pickup time.');
  const earliest = now.getTime() + (restaurant.prepMinutes - 5) * 60_000;
  const latest = now.getTime() + 24 * 60 * 60_000;
  const left = minutesUntilClose(at, hours);
  if (at.getTime() < earliest || at.getTime() > latest || left === null || left < restaurant.lastOrderMinutesBeforeClose) {
    throw new RequestError('That pickup time is no longer available. Please pick another.');
  }
  return { type: 'scheduled', time: at.toISOString() };
}

function parsePayment(v: unknown): PaymentChoice {
  if (!isRecord(v)) throw new RequestError('Choose how you want to pay.');
  if (v.method === 'in_store') return { method: 'in_store' };
  if (v.method === 'card') {
    const token = str(v.token, 'card', 200)!;
    const tip = v.tip ?? 0;
    if (typeof tip !== 'number' || !Number.isInteger(tip) || tip < 0 || tip > LIMITS.maxTip) {
      throw new RequestError('Invalid tip.');
    }
    return { method: 'card', token, tip };
  }
  throw new RequestError('Choose how you want to pay.');
}

/**
 * Validates an order request body from a customer's browser or phone. Prices and item
 * availability are checked separately against the menu by `priceCart`.
 */
export function parseOrderRequest(
  body: unknown,
  now: Date = new Date(),
  hours: WeeklyHours = restaurant.hours,
): OrderRequest {
  if (!isRecord(body)) throw new RequestError('Invalid order.');
  if (!isAcceptingOrders(now, hours) && (!isRecord(body.pickup) || body.pickup.type !== 'scheduled')) {
    throw new RequestError("We're not taking ASAP orders right now. Please schedule a pickup time or call us.");
  }
  const notes = str(body.notes, 'order note', LIMITS.maxOrderNote, false);
  return {
    lines: parseCartLines(body.lines),
    customer: parseCustomer(body.customer),
    pickup: parsePickup(body.pickup, now, hours),
    ...(notes ? { notes } : {}),
    payment: parsePayment(body.payment),
    source: body.source === 'app' ? 'app' : 'web',
  };
}
