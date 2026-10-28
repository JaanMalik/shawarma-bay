import type { CartLine, Cents, Menu, PricedLine, Quote } from './types';

export const LIMITS = {
  maxLines: 30,
  maxQuantityPerLine: 20,
  maxItemNote: 140,
  maxOrderNote: 200,
  maxTip: 100_00,
} as const;

export class CartError extends Error {
  constructor(
    message: string,
    readonly lineIndex?: number,
  ) {
    super(message);
    this.name = 'CartError';
  }
}

/**
 * Checks every line against the menu (item exists and is available, modifier rules are met)
 * and prices it from the menu, never from anything the customer's device sent.
 */
export function priceCart(menu: Menu, lines: CartLine[]): PricedLine[] {
  if (lines.length === 0) throw new CartError('Your cart is empty.');
  if (lines.length > LIMITS.maxLines) throw new CartError('That order is too large to place online. Please call us.');

  return lines.map((line, index) => {
    const item = menu.items[line.itemId];
    if (!item) throw new CartError('An item in your cart is no longer on the menu.', index);
    if (!item.available) throw new CartError(`${item.name} is sold out right now.`, index);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > LIMITS.maxQuantityPerLine) {
      throw new CartError(`Choose between 1 and ${LIMITS.maxQuantityPerLine} of ${item.name}.`, index);
    }
    if (line.note && line.note.length > LIMITS.maxItemNote) {
      throw new CartError(`Keep the note for ${item.name} under ${LIMITS.maxItemNote} characters.`, index);
    }

    const chosen = new Set(line.modifierIds);
    if (chosen.size !== line.modifierIds.length) throw new CartError(`Pick each option for ${item.name} once.`, index);

    const modifiers: PricedLine['modifiers'] = [];
    const allowed = new Set<string>();
    for (const groupId of item.modifierGroupIds) {
      const group = menu.modifierGroups[groupId];
      if (!group) continue;
      const picked = group.modifiers.filter((m) => chosen.has(m.id));
      for (const m of group.modifiers) allowed.add(m.id);
      if (picked.length < group.min) {
        throw new CartError(
          group.min === 1
            ? `Choose an option for "${group.name}" on ${item.name}.`
            : `Choose ${group.min} options for "${group.name}" on ${item.name}.`,
          index,
        );
      }
      if (group.max !== null && picked.length > group.max) {
        throw new CartError(`Choose at most ${group.max} for "${group.name}" on ${item.name}.`, index);
      }
      for (const m of picked) {
        if (!m.available) throw new CartError(`${m.name} is sold out right now.`, index);
        modifiers.push({ id: m.id, name: m.name, price: m.price });
      }
    }
    for (const id of chosen) {
      if (!allowed.has(id)) throw new CartError(`An option on ${item.name} is no longer available.`, index);
    }

    const unitPrice = item.price + modifiers.reduce((sum, m) => sum + m.price, 0);
    return {
      itemId: item.id,
      quantity: line.quantity,
      modifierIds: modifiers.map((m) => m.id),
      note: line.note?.trim() || undefined,
      name: item.name,
      modifiers,
      unitPrice,
      lineTotal: unitPrice * line.quantity,
    };
  });
}

export function subtotalOf(lines: PricedLine[]): Cents {
  return lines.reduce((sum, l) => sum + l.lineTotal, 0);
}

/** A quote calculated locally with a flat tax rate (demo mode). Clover calculates real ones. */
export function localQuote(menu: Menu, lines: CartLine[], taxRate: number): Quote {
  const priced = priceCart(menu, lines);
  const subtotal = subtotalOf(priced);
  const tax = Math.round(subtotal * taxRate);
  return { lines: priced, subtotal, tax, total: subtotal + tax };
}

/** Suggested tip amounts for a subtotal, rounded to the cent. */
export function tipOptions(subtotal: Cents, percents: number[] = [10, 15, 20]): { percent: number; amount: Cents }[] {
  return percents.map((percent) => ({ percent, amount: Math.round((subtotal * percent) / 100) }));
}
