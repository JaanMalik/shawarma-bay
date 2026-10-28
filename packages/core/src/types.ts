/** All money values are integer cents, the same unit Clover uses. */
export type Cents = number;

export interface Modifier {
  id: string;
  name: string;
  price: Cents;
  available: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  /** Fewest options the customer must pick (0 = optional). */
  min: number;
  /** Most options the customer may pick (null = no limit). */
  max: number | null;
  modifiers: Modifier[];
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: Cents;
  available: boolean;
  modifierGroupIds: string[];
  /** Short labels such as "Popular" shown on the item card. */
  tags?: string[];
  /** Path or URL of a photo; relative paths are served by the website. */
  image?: string;
}

export interface Category {
  id: string;
  name: string;
  itemIds: string[];
}

export interface Menu {
  /** "clover" when read live from the restaurant's Clover inventory, "seed" for the built-in copy. */
  source: 'clover' | 'seed';
  categories: Category[];
  items: Record<string, MenuItem>;
  modifierGroups: Record<string, ModifierGroup>;
}

export interface CartLine {
  itemId: string;
  quantity: number;
  modifierIds: string[];
  note?: string;
}

export interface PricedLine extends CartLine {
  name: string;
  modifiers: { id: string; name: string; price: Cents }[];
  unitPrice: Cents;
  lineTotal: Cents;
}

export interface Quote {
  lines: PricedLine[];
  subtotal: Cents;
  tax: Cents;
  total: Cents;
}

export interface Customer {
  name: string;
  phone: string;
}

export type Pickup = { type: 'asap' } | { type: 'scheduled'; time: string };

export type PaymentChoice =
  | { method: 'in_store' }
  | { method: 'card'; token: string; tip: Cents };

export type OrderSource = 'web' | 'app';

export interface OrderRequest {
  lines: CartLine[];
  customer: Customer;
  pickup: Pickup;
  notes?: string;
  payment: PaymentChoice;
  source: OrderSource;
}

export interface OrderLineView {
  name: string;
  quantity: number;
  modifiers: string[];
  note?: string;
  total: Cents;
}

/** What the order page and the in-store order screen show about an order. */
export interface OrderView {
  id: string;
  createdAt: string;
  customerName: string;
  /** Only included for the in-store order screen. */
  customerPhone?: string;
  pickupLabel: string;
  /** ISO time the customer expects to pick up, when known. */
  pickupAt?: string;
  paidOnline: boolean;
  source: OrderSource | 'unknown';
  notes?: string;
  lines: OrderLineView[];
  subtotal: Cents;
  tax: Cents;
  tip: Cents;
  total: Cents;
}
