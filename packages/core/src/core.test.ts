import { describe, expect, it } from 'vitest';

import {
  CartError,
  decodeHandoff,
  decorateMenu,
  encodeHandoff,
  formatMoney,
  hoursLabel,
  isAcceptingOrders,
  isOpen,
  localQuote,
  minutesUntilClose,
  normalizePhone,
  orderNote,
  orderTitle,
  parseOrderNote,
  parseOrderRequest,
  pickupSlots,
  priceCart,
  RequestError,
  seedMenu,
  type OrderRequest,
  type WeeklyHours,
} from './index';

// 2026-10-28 is a Wednesday; New York is on EDT (UTC-4) until Nov 1.
const at = (localTime: string) => new Date(`2026-10-28T${localTime}:00-04:00`);
/** Thursday, just after Wednesday night's midnight. */
const thu = (localTime: string) => new Date(`2026-10-29T${localTime}:00-04:00`);

const weekOf = (open: string, close: string): WeeklyHours => ({
  sun: [[open, close]], mon: [[open, close]], tue: [[open, close]], wed: [[open, close]],
  thu: [[open, close]], fri: [[open, close]], sat: [[open, close]],
});

describe('hours', () => {
  it('is open from 11 AM until 1 AM the next morning', () => {
    expect(isOpen(at('10:59'))).toBe(false);
    expect(isOpen(at('11:00'))).toBe(true);
    expect(isOpen(at('23:59'))).toBe(true);
    expect(isOpen(thu('00:59'))).toBe(true);
    expect(isOpen(thu('01:00'))).toBe(false);
    expect(isOpen(thu('10:59'))).toBe(false);
  });

  it('stops taking orders shortly before closing, after midnight', () => {
    expect(isAcceptingOrders(at('23:50'))).toBe(true);
    expect(isAcceptingOrders(thu('00:40'))).toBe(true);
    expect(isAcceptingOrders(thu('00:46'))).toBe(false);
  });

  it('counts down to a close that runs past midnight', () => {
    expect(minutesUntilClose(at('23:30'))).toBe(90);
    expect(minutesUntilClose(thu('00:30'))).toBe(30);
    expect(minutesUntilClose(thu('01:30'))).toBeNull();
  });

  it('offers late pickup slots past midnight, up to the cutoff', () => {
    const slots = pickupSlots(at('23:30'));
    expect(slots[0]).toBe(thu('00:00').toISOString());
    expect(slots.at(-1)).toBe(thu('00:45').toISOString());
  });

  it('offers no slots after closing and the next day is not included', () => {
    expect(pickupSlots(at('21:30'), { hours: weekOf('11:00', '21:00') })).toEqual([]);
  });

  it('after closing at 1 AM, offers the same day from opening', () => {
    const slots = pickupSlots(thu('01:30'));
    expect(slots[0]).toBe(thu('11:00').toISOString());
  });

  it('starts the day at opening when ordering ahead in the morning', () => {
    const slots = pickupSlots(at('09:00'));
    expect(slots[0]).toBe(at('11:00').toISOString());
  });

  it('labels the hours', () => {
    expect(hoursLabel(at('12:00'))).toBe('11:00 AM – 1:00 AM');
  });

  it('labels the night that is still running just after midnight', () => {
    const hours: WeeklyHours = { ...weekOf('11:00', '01:00'), wed: [['11:00', '02:00']] };
    expect(hoursLabel(thu('01:30'), hours)).toBe('11:00 AM – 2:00 AM');
    expect(hoursLabel(thu('02:30'), hours)).toBe('11:00 AM – 1:00 AM');
  });
});

describe('pricing', () => {
  const menu = decorateMenu(seedMenu);

  it('prices lines from the menu', () => {
    const quote = localQuote(
      menu,
      [
        { itemId: 'platter-beef-chapli', quantity: 2, modifierIds: [] },
        { itemId: 'drink-soda', quantity: 1, modifierIds: [] },
      ],
      0.08625,
    );
    expect(quote.subtotal).toBe(2 * 1299 + 199);
    expect(quote.tax).toBe(Math.round(2797 * 0.08625));
    expect(quote.total).toBe(quote.subtotal + quote.tax);
  });

  it('enforces required choices on the combo', () => {
    expect(() => priceCart(menu, [{ itemId: 'platter-custom-combo', quantity: 1, modifierIds: [] }])).toThrow(
      CartError,
    );
    const [line] = priceCart(menu, [
      { itemId: 'platter-custom-combo', quantity: 1, modifierIds: ['mod-combo-beef-doner', 'mod-combo-falafel'] },
    ]);
    expect(line.modifiers.map((m) => m.name)).toEqual(['Beef Doner', 'Falafel']);
    expect(line.lineTotal).toBe(1299);
  });

  it('rejects options that do not belong to the item', () => {
    expect(() =>
      priceCart(menu, [{ itemId: 'drink-water', quantity: 1, modifierIds: ['mod-combo-falafel'] }]),
    ).toThrow(/no longer available/);
  });

  it('rejects unknown, sold out, and oversized lines', () => {
    expect(() => priceCart(menu, [{ itemId: 'nope', quantity: 1, modifierIds: [] }])).toThrow(CartError);
    const soldOut = { ...menu, items: { ...menu.items, 'drink-water': { ...menu.items['drink-water'], available: false } } };
    expect(() => priceCart(soldOut, [{ itemId: 'drink-water', quantity: 1, modifierIds: [] }])).toThrow(/sold out/);
    expect(() => priceCart(menu, [{ itemId: 'drink-water', quantity: 21, modifierIds: [] }])).toThrow(CartError);
    expect(() => priceCart(menu, [])).toThrow(/empty/);
  });

  it('formats money', () => {
    expect(formatMoney(1299)).toBe('$12.99');
    expect(formatMoney(5)).toBe('$0.05');
  });
});

describe('order requests', () => {
  const body = {
    lines: [{ itemId: 'wrap-gyro', quantity: 1, modifierIds: [] }],
    customer: { name: ' Jaan Malik ', phone: '+1 (516) 555-0123' },
    pickup: { type: 'asap' },
    payment: { method: 'in_store' },
    source: 'app',
  };

  it('parses a valid request', () => {
    const order = parseOrderRequest(body, at('12:00'));
    expect(order.customer).toEqual({ name: 'Jaan Malik', phone: '5165550123' });
    expect(order.source).toBe('app');
  });

  it('rejects bad phone numbers and ASAP orders when closed', () => {
    expect(() => parseOrderRequest({ ...body, customer: { name: 'A', phone: '123' } }, at('12:00'))).toThrow(
      RequestError,
    );
    expect(() => parseOrderRequest(body, thu('00:50'))).toThrow(/not taking ASAP/);
    expect(() => parseOrderRequest(body, thu('02:00'))).toThrow(/not taking ASAP/);
  });

  it('accepts scheduled pickups within hours only', () => {
    const ok = { ...body, pickup: { type: 'scheduled', time: at('13:00').toISOString() } };
    expect(parseOrderRequest(ok, at('12:00')).pickup).toEqual({ type: 'scheduled', time: at('13:00').toISOString() });
    const tooSoon = { ...body, pickup: { type: 'scheduled', time: at('12:05').toISOString() } };
    expect(() => parseOrderRequest(tooSoon, at('12:00'))).toThrow(/no longer available/);
    const lateNight = { ...body, pickup: { type: 'scheduled', time: thu('00:30').toISOString() } };
    expect(parseOrderRequest(lateNight, at('23:30')).pickup).toEqual({ type: 'scheduled', time: thu('00:30').toISOString() });
    const pastCutoff = { ...body, pickup: { type: 'scheduled', time: thu('00:50').toISOString() } };
    expect(() => parseOrderRequest(pastCutoff, at('12:00'))).toThrow(/no longer available/);
    const afterClose = { ...body, pickup: { type: 'scheduled', time: thu('01:15').toISOString() } };
    expect(() => parseOrderRequest(afterClose, at('12:00'))).toThrow(/no longer available/);
  });

  it('normalizes phone numbers', () => {
    expect(normalizePhone('516.312.6987')).toBe('5163126987');
    expect(normalizePhone('15163126987')).toBe('5163126987');
    expect(normalizePhone('312-6987')).toBeNull();
  });
});

describe('order notes', () => {
  const order: OrderRequest = {
    lines: [],
    customer: { name: 'Jaan Malik', phone: '5165550123' },
    pickup: { type: 'scheduled', time: at('19:45').toISOString() },
    notes: 'Extra\ngarlic sauce',
    payment: { method: 'card', token: 'clv_x', tip: 200 },
    source: 'web',
  };

  it('round-trips through the Clover note', () => {
    const note = orderNote(order, at('19:00'));
    expect(note).toBe(
      [
        'ONLINE ORDER (web)',
        'PREPAID ONLINE',
        'Pickup: 7:45 PM',
        'Customer: Jaan Malik, (516) 555-0123',
        'Tip: $2.00',
        'Note: Extra garlic sauce',
      ].join('\n'),
    );
    expect(parseOrderNote(note)).toEqual({
      online: true,
      source: 'web',
      paidOnline: true,
      pickupLabel: '7:45 PM',
      customerName: 'Jaan Malik',
      customerPhone: '(516) 555-0123',
      notes: 'Extra garlic sauce',
    });
    expect(orderTitle(order)).toBe('Online · Jaan M.');
  });

  it('ignores orders that were not placed online', () => {
    expect(parseOrderNote('Table 4').online).toBe(false);
    expect(parseOrderNote(undefined).online).toBe(false);
  });
});

describe('app to web handoff', () => {
  it('round-trips, including non-ASCII notes', () => {
    const handoff = {
      lines: [{ itemId: 'wrap-gyro', quantity: 2, modifierIds: [], note: 'No onions — thanks' }],
      customer: { name: 'Zoë', phone: '5165550123' },
      pickup: { type: 'asap' as const },
    };
    const encoded = encodeHandoff(handoff);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeHandoff(encoded)).toEqual(handoff);
    expect(decodeHandoff('not base64!')).toBeNull();
  });
});

describe('always open (demo)', () => {
  it('accepts orders at any hour and labels it', async () => {
    const { ALWAYS_OPEN } = await import('./index');
    expect(isAcceptingOrders(at('03:00'), ALWAYS_OPEN)).toBe(true);
    expect(pickupSlots(at('22:00'), { hours: ALWAYS_OPEN }).length).toBeGreaterThan(0);
    expect(hoursLabel(at('12:00'), ALWAYS_OPEN)).toBe('Open 24 hours');
  });
});
