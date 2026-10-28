import {
  ONLINE_TITLE_PREFIX,
  parseOrderNote,
  shortName,
  type Category,
  type Menu,
  type MenuItem,
  type ModifierGroup,
  type OrderLineView,
  type OrderView,
  type PricedLine,
} from '@shawarma-bay/core';

import type { AtomicLineItem, CloverCategory, CloverItem, CloverModifierGroup, CloverOrder } from './clover';

/** Turns Clover inventory into the menu the website and app show. */
export function menuFromClover(inv: {
  categories: CloverCategory[];
  items: CloverItem[];
  modifierGroups: CloverModifierGroup[];
}): Menu {
  const items: Record<string, MenuItem> = {};
  for (const item of inv.items) {
    // Open-priced and weighed items can't be ordered online.
    if (item.hidden || (item.priceType && item.priceType !== 'FIXED')) continue;
    items[item.id] = {
      id: item.id,
      name: item.name,
      price: item.price,
      available: item.available !== false,
      modifierGroupIds: (item.modifierGroups?.elements ?? []).map((g) => g.id),
    };
  }

  const modifierGroups: Record<string, ModifierGroup> = {};
  for (const group of inv.modifierGroups) {
    modifierGroups[group.id] = {
      id: group.id,
      name: group.name,
      min: group.minRequired ?? 0,
      max: group.maxAllowed && group.maxAllowed > 0 ? group.maxAllowed : null,
      modifiers: (group.modifiers?.elements ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        price: m.price ?? 0,
        available: m.available !== false,
      })),
    };
  }

  const placed = new Set<string>();
  const categories: Category[] = [...inv.categories]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((c) => {
      const itemIds = (c.items?.elements ?? []).map((i) => i.id).filter((id) => items[id] && !placed.has(id));
      itemIds.forEach((id) => placed.add(id));
      return { id: c.id, name: c.name, itemIds };
    })
    .filter((c) => c.itemIds.length > 0);

  const loose = Object.keys(items).filter((id) => !placed.has(id));
  if (loose.length > 0) categories.push({ id: 'uncategorized', name: 'More', itemIds: loose });

  return { source: 'clover', categories, items, modifierGroups };
}

/** Clover stores one line item per unit, so a quantity of 3 becomes three line items. */
export function atomicLineItems(lines: PricedLine[]): AtomicLineItem[] {
  return lines.flatMap((line) =>
    Array.from({ length: line.quantity }, () => ({
      item: { id: line.itemId },
      ...(line.note ? { note: line.note } : {}),
      ...(line.modifiers.length > 0
        ? {
            modifications: line.modifiers.map((m) => ({
              modifier: { id: m.id, name: m.name, price: m.price, available: true },
              amount: m.price,
            })),
          }
        : {}),
    })),
  );
}

export function isOnlineOrder(order: CloverOrder): boolean {
  return Boolean(order.title?.startsWith(ONLINE_TITLE_PREFIX)) && parseOrderNote(order.note).online;
}

/**
 * Converts a Clover order placed through this site into the view the order page and the
 * in-store screen show. Returns null for orders rung up in the restaurant.
 */
export function orderViewFromClover(order: CloverOrder, { forKitchen }: { forKitchen: boolean }): OrderView | null {
  if (!isOnlineOrder(order)) return null;
  const note = parseOrderNote(order.note);

  const grouped = new Map<string, OrderLineView>();
  for (const li of order.lineItems?.elements ?? []) {
    const mods = li.modifications?.elements ?? [];
    const unit = li.price + mods.reduce((sum, m) => sum + (m.amount ?? 0), 0);
    const modifiers = mods.map((m) => m.name);
    const key = JSON.stringify([li.name, modifiers, li.note ?? '', unit]);
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.total += unit;
    } else {
      grouped.set(key, { name: li.name, quantity: 1, modifiers, note: li.note || undefined, total: unit });
    }
  }
  const lines = [...grouped.values()];
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const total = order.total ?? subtotal;
  const tip = (order.payments?.elements ?? []).reduce((sum, p) => sum + (p.tipAmount ?? 0), 0);
  const name = note.customerName ?? order.title?.replace(/^Online · /, '') ?? 'Guest';

  return {
    id: order.id,
    createdAt: new Date(order.createdTime ?? Date.now()).toISOString(),
    customerName: forKitchen ? name : shortName(name),
    ...(forKitchen && note.customerPhone ? { customerPhone: note.customerPhone } : {}),
    pickupLabel: note.pickupLabel ?? 'ASAP',
    paidOnline: note.paidOnline,
    source: note.source,
    ...(note.notes ? { notes: note.notes } : {}),
    lines,
    subtotal,
    tax: Math.max(0, total - subtotal),
    tip,
    total: total + tip,
  };
}
