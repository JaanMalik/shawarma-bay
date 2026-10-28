import 'server-only';

import { publicConfig } from '@/lib/public-config';

/**
 * Thin client for the Clover APIs this site uses:
 * - Platform REST API (inventory, atomic orders, printing), authorized with CLOVER_API_TOKEN.
 * - Ecommerce API (paying for an order with a card token), authorized with
 *   CLOVER_ECOMMERCE_PRIVATE_KEY.
 * Docs: https://docs.clover.com/dev/docs/create-an-atomic-order and
 * https://docs.clover.com/docs/ecommerce-accepting-payments
 */

const HOSTS = {
  sandbox: { api: 'https://apisandbox.dev.clover.com', ecommerce: 'https://scl-sandbox.dev.clover.com' },
  production: { api: 'https://api.clover.com', ecommerce: 'https://scl.clover.com' },
} as const;

const USER_AGENT = 'ShawarmaBayOrdering/0.1';

export class CloverError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** A message that is safe to show a customer, when Clover gave one (for example a decline). */
    readonly customerMessage?: string,
  ) {
    super(message);
    this.name = 'CloverError';
  }
}

export function cloverCredentials() {
  const merchantId = publicConfig.merchantId;
  const apiToken = process.env.CLOVER_API_TOKEN ?? '';
  const ecommerceKey = process.env.CLOVER_ECOMMERCE_PRIVATE_KEY ?? '';
  return { merchantId, apiToken, ecommerceKey, hosts: HOSTS[publicConfig.cloverEnv] };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

async function request<T>(base: 'api' | 'ecommerce', path: string, opts: RequestOptions = {}): Promise<T> {
  const { merchantId, apiToken, ecommerceKey, hosts } = cloverCredentials();
  const token = base === 'api' ? apiToken : ecommerceKey;
  if (!merchantId || !token) {
    throw new CloverError(`Clover ${base === 'api' ? 'API token' : 'ecommerce key'} is not configured`, 500);
  }
  const url = `${hosts[base]}${path.replace('{mId}', encodeURIComponent(merchantId))}`;
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': USER_AGENT,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // Some Clover errors are plain text.
  }
  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string }; message?: string } | undefined) ?? {};
    const message = err.error?.message ?? err.message ?? text.slice(0, 200);
    // Ecommerce errors (declines, bad card details) carry a message meant for the payer.
    const customerMessage = base === 'ecommerce' && res.status < 500 ? err.error?.message : undefined;
    throw new CloverError(`Clover ${opts.method ?? 'GET'} ${path} failed (${res.status}): ${message}`, res.status, customerMessage);
  }
  return data as T;
}

// ---- Response shapes (only the fields this site reads) ----

export interface CloverList<T> {
  elements?: T[];
}

export interface CloverCategory {
  id: string;
  name: string;
  sortOrder?: number;
  items?: CloverList<{ id: string }>;
}

export interface CloverItem {
  id: string;
  name: string;
  price: number;
  priceType?: 'FIXED' | 'VARIABLE' | 'PER_UNIT';
  hidden?: boolean;
  available?: boolean;
  modifierGroups?: CloverList<{ id: string }>;
}

export interface CloverModifier {
  id: string;
  name: string;
  price?: number;
  available?: boolean;
}

export interface CloverModifierGroup {
  id: string;
  name: string;
  minRequired?: number;
  maxAllowed?: number;
  modifiers?: CloverList<CloverModifier>;
}

export interface CloverOrderType {
  id: string;
  label: string;
}

export interface CloverLineItem {
  id?: string;
  name: string;
  price: number;
  note?: string;
  modifications?: CloverList<{ name: string; amount?: number }>;
}

export interface CloverOrder {
  id: string;
  title?: string;
  note?: string;
  total?: number;
  state?: string;
  paymentState?: string;
  createdTime?: number;
  lineItems?: CloverList<CloverLineItem>;
  payments?: CloverList<{ amount?: number; tipAmount?: number; result?: string }>;
}

export interface AtomicLineItem {
  item: { id: string };
  note?: string;
  modifications?: { modifier: { id: string; name: string; price: number; available: boolean }; amount: number }[];
}

export interface AtomicOrderCart {
  title?: string;
  note?: string;
  orderType?: { id: string };
  lineItems: AtomicLineItem[];
}

// ---- Inventory ----

export async function fetchInventory() {
  const [categories, items, groups] = await Promise.all([
    request<CloverList<CloverCategory>>('api', '/v3/merchants/{mId}/categories?expand=items&limit=1000'),
    request<CloverList<CloverItem>>('api', '/v3/merchants/{mId}/items?expand=modifierGroups&limit=1000'),
    request<CloverList<CloverModifierGroup>>('api', '/v3/merchants/{mId}/modifier_groups?expand=modifiers&limit=1000'),
  ]);
  return {
    categories: categories.elements ?? [],
    items: items.elements ?? [],
    modifierGroups: groups.elements ?? [],
  };
}

let orderTypeId: string | undefined = process.env.CLOVER_ORDER_TYPE_ID || undefined;

/** The order type online orders are filed under: CLOVER_ORDER_TYPE_ID, else a likely match by name. */
export async function onlineOrderTypeId(): Promise<string | undefined> {
  if (orderTypeId) return orderTypeId;
  const types = (await request<CloverList<CloverOrderType>>('api', '/v3/merchants/{mId}/order_types?limit=100')).elements ?? [];
  const pick =
    types.find((t) => /online/i.test(t.label)) ??
    types.find((t) => /pick ?up|to ?go|take ?out/i.test(t.label)) ??
    types[0];
  orderTypeId = pick?.id;
  return orderTypeId;
}

// ---- Orders ----

/** Totals and tax for a cart, without creating an order. */
export function calculateOrder(orderCart: AtomicOrderCart) {
  return request<CloverOrder>('api', '/v3/merchants/{mId}/atomic_order/checkouts', {
    method: 'POST',
    body: { orderCart },
  });
}

/** Creates the order; it shows up on the restaurant's Clover devices and dashboard. */
export function createOrder(orderCart: AtomicOrderCart) {
  return request<CloverOrder>('api', '/v3/merchants/{mId}/atomic_order/orders', {
    method: 'POST',
    body: { orderCart },
  });
}

export function deleteOrder(orderId: string) {
  return request<unknown>('api', `/v3/merchants/{mId}/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
}

/** Sends the order to the order printer of the restaurant's Clover device. */
export function printOrder(orderId: string) {
  return request<{ id: string; state: string }>('api', '/v3/merchants/{mId}/print_event', {
    method: 'POST',
    body: { orderRef: { id: orderId } },
  });
}

const ORDER_EXPAND = 'expand=lineItems,lineItems.modifications,payments';

export function getOrder(orderId: string) {
  return request<CloverOrder>('api', `/v3/merchants/{mId}/orders/${encodeURIComponent(orderId)}?${ORDER_EXPAND}`);
}

export async function listOrdersSince(sinceMs: number) {
  const params = `filter=${encodeURIComponent(`createdTime>=${sinceMs}`)}&${ORDER_EXPAND}&orderBy=${encodeURIComponent('createdTime DESC')}&limit=100`;
  return (await request<CloverList<CloverOrder>>('api', `/v3/merchants/{mId}/orders?${params}`)).elements ?? [];
}

// ---- Payments ----

export interface PayResult {
  id: string;
  status?: string;
  amount?: number;
  amount_paid?: number;
  charge?: string;
}

/** Charges a card token (from Clover's hosted card fields) for the full order amount. */
export function payOrder(orderId: string, args: { token: string; tip: number; clientIp: string; idempotencyKey: string }) {
  return request<PayResult>('ecommerce', `/v1/orders/${encodeURIComponent(orderId)}/pay`, {
    method: 'POST',
    headers: { 'x-forwarded-for': args.clientIp, 'idempotency-key': args.idempotencyKey },
    body: { source: args.token, ...(args.tip > 0 ? { tip_amount: args.tip } : {}) },
  });
}
