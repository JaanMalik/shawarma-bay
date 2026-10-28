import { describe, expect, it } from 'vitest';

import { orderNote, orderTitle, priceCart, seedMenu, type OrderRequest } from '@shawarma-bay/core';

import { atomicLineItems, menuFromClover, orderViewFromClover } from './clover-map';

describe('menuFromClover', () => {
  it('builds categories in Clover order and skips hidden and open-priced items', () => {
    const menu = menuFromClover({
      categories: [
        { id: 'C2', name: 'Drinks', sortOrder: 2, items: { elements: [{ id: 'I3' }] } },
        { id: 'C1', name: 'Wraps', sortOrder: 1, items: { elements: [{ id: 'I1' }, { id: 'I2' }, { id: 'I4' }] } },
      ],
      items: [
        { id: 'I1', name: 'Gyro', price: 900, modifierGroups: { elements: [{ id: 'G1' }] } },
        { id: 'I2', name: 'Secret', price: 100, hidden: true },
        { id: 'I3', name: 'Soda', price: 199, available: false },
        { id: 'I4', name: 'Catering', price: 0, priceType: 'VARIABLE' },
        { id: 'I5', name: 'Baklava', price: 500 },
      ],
      modifierGroups: [
        {
          id: 'G1',
          name: 'Meat',
          minRequired: 1,
          maxAllowed: 1,
          modifiers: { elements: [{ id: 'M1', name: 'Chicken' }, { id: 'M2', name: 'Beef', price: 100 }] },
        },
      ],
    });
    expect(menu.categories.map((c) => [c.name, c.itemIds])).toEqual([
      ['Wraps', ['I1']],
      ['Drinks', ['I3']],
      ['More', ['I5']],
    ]);
    expect(menu.items.I3.available).toBe(false);
    expect(menu.modifierGroups.G1).toMatchObject({ min: 1, max: 1 });
    expect(menu.modifierGroups.G1.modifiers[1]).toEqual({ id: 'M2', name: 'Beef', price: 100, available: true });
  });
});

describe('atomicLineItems', () => {
  it('repeats a line once per unit and carries options and notes', () => {
    const priced = priceCart(seedMenu, [
      {
        itemId: 'platter-custom-combo',
        quantity: 2,
        modifierIds: ['mod-combo-beef-doner', 'mod-combo-falafel'],
        note: 'extra sauce',
      },
    ]);
    const items = atomicLineItems(priced);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      item: { id: 'platter-custom-combo' },
      note: 'extra sauce',
      modifications: [
        { modifier: { id: 'mod-combo-beef-doner', name: 'Beef Doner', price: 0, available: true }, amount: 0 },
        { modifier: { id: 'mod-combo-falafel', name: 'Falafel', price: 0, available: true }, amount: 0 },
      ],
    });
  });
});

describe('orderViewFromClover', () => {
  const request: OrderRequest = {
    lines: [],
    customer: { name: 'Jaan Malik', phone: '5165550123' },
    pickup: { type: 'asap' },
    payment: { method: 'in_store' },
    source: 'app',
  };
  const placedAt = new Date('2026-10-28T16:00:00Z');
  const cloverOrder = {
    id: 'ABCDEFGH12345',
    title: orderTitle(request),
    note: orderNote(request, placedAt),
    total: 3038,
    createdTime: placedAt.getTime(),
    lineItems: {
      elements: [
        { name: 'Combo', price: 1299, modifications: { elements: [{ name: 'Falafel', amount: 0 }] } },
        { name: 'Combo', price: 1299, modifications: { elements: [{ name: 'Falafel', amount: 0 }] } },
        { name: 'Soda', price: 199 },
      ],
    },
  };

  it('groups repeated line items and works out tax', () => {
    const view = orderViewFromClover(cloverOrder, { forKitchen: true })!;
    expect(view.lines).toEqual([
      { name: 'Combo', quantity: 2, modifiers: ['Falafel'], total: 2598 },
      { name: 'Soda', quantity: 1, modifiers: [], total: 199 },
    ]);
    expect(view).toMatchObject({
      subtotal: 2797,
      tax: 241,
      total: 3038,
      paidOnline: false,
      source: 'app',
      customerName: 'Jaan Malik',
      customerPhone: '(516) 555-0123',
      pickupLabel: 'ASAP (about 12:20 PM)',
    });
  });

  it('hides the phone and last name from customers', () => {
    const view = orderViewFromClover(cloverOrder, { forKitchen: false })!;
    expect(view.customerName).toBe('Jaan M.');
    expect(view.customerPhone).toBeUndefined();
  });

  it('ignores orders rung up in the restaurant', () => {
    expect(orderViewFromClover({ ...cloverOrder, title: 'Table 4', note: '' }, { forKitchen: true })).toBeNull();
  });
});
