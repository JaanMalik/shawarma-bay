import 'server-only';

import { randomUUID } from 'node:crypto';

import { cacheLife } from 'next/cache';

import {
  CartError,
  decorateMenu,
  localQuote,
  orderNote,
  orderTitle,
  priceCart,
  restaurant,
  seedMenu,
  shortName,
  subtotalOf,
  type CartLine,
  type Menu,
  type OrderRequest,
  type OrderView,
  type Quote,
} from '@shawarma-bay/core';

import { publicConfig } from '@/lib/public-config';

import * as clover from './clover';
import { atomicLineItems, menuFromClover, orderViewFromClover } from './clover-map';
import { getDemoOrder, listDemoOrders, saveDemoOrder } from './demo-store';

/** A problem the customer can fix or should know about; its message is shown to them. */
export class OrderError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

const cloverConnected = () => !publicConfig.demo;

/**
 * The menu, refreshed from Clover at most every minute or so. If Clover can't be reached the
 * built-in copy is shown so the site never goes blank.
 */
export async function getMenu(): Promise<Menu> {
  'use cache';
  cacheLife('minutes');
  if (!cloverConnected()) return decorateMenu(seedMenu);
  try {
    return decorateMenu(menuFromClover(await clover.fetchInventory()));
  } catch (err) {
    console.error('Could not load the Clover menu, showing the built-in copy', err);
    return decorateMenu(seedMenu);
  }
}

function priceOrThrow(menu: Menu, lines: CartLine[]) {
  try {
    return priceCart(menu, lines);
  } catch (err) {
    if (err instanceof CartError) throw new OrderError(err.message);
    throw err;
  }
}

async function orderTypeRef() {
  const id = await clover.onlineOrderTypeId();
  return id ? { orderType: { id } } : {};
}

export async function quote(lines: CartLine[]): Promise<Quote> {
  const menu = await getMenu();
  if (!cloverConnected()) {
    try {
      return localQuote(menu, lines, restaurant.demoTaxRate);
    } catch (err) {
      if (err instanceof CartError) throw new OrderError(err.message);
      throw err;
    }
  }
  const priced = priceOrThrow(menu, lines);
  const subtotal = subtotalOf(priced);
  const calc = await clover.calculateOrder({ ...(await orderTypeRef()), lineItems: atomicLineItems(priced) });
  const total = calc.total ?? subtotal;
  return { lines: priced, subtotal, tax: Math.max(0, total - subtotal), total };
}

/**
 * Places an order: creates it in Clover, charges the card if paying online (removing the order
 * again if the charge fails), then prints the ticket in the kitchen.
 */
export async function placeOrder(order: OrderRequest, clientIp: string): Promise<OrderView> {
  const placedAt = new Date();
  if (order.payment.method === 'card' && !publicConfig.onlinePayments) {
    throw new OrderError('Online payment is not available right now. Choose pay at pickup.');
  }
  if (order.payment.method === 'in_store' && !publicConfig.payAtPickup) {
    throw new OrderError('Please pay online to place this order.');
  }

  if (!cloverConnected()) {
    const q = await quote(order.lines);
    if (order.payment.method === 'card' && order.payment.token === 'demo_decline') {
      throw new OrderError('Your card was declined. (Demo mode: this is a pretend decline.)', 402);
    }
    return saveDemoOrder(order, q, placedAt);
  }

  const priced = priceOrThrow(await getMenu(), order.lines);
  const created = await clover.createOrder({
    ...(await orderTypeRef()),
    title: orderTitle(order),
    note: orderNote(order, placedAt),
    lineItems: atomicLineItems(priced),
  });

  if (order.payment.method === 'card') {
    try {
      const paid = await clover.payOrder(created.id, {
        token: order.payment.token,
        tip: order.payment.tip,
        clientIp,
        idempotencyKey: randomUUID(),
      });
      if (paid.status && paid.status !== 'paid') throw new OrderError('Your payment did not go through.', 402);
    } catch (err) {
      await clover.deleteOrder(created.id).catch((e) => console.error('Could not remove unpaid order', created.id, e));
      if (err instanceof clover.CloverError && err.customerMessage) throw new OrderError(err.customerMessage, 402);
      if (err instanceof OrderError) throw err;
      console.error('Payment failed', err);
      throw new OrderError('We could not charge your card. Please try again or choose pay at pickup.', 402);
    }
  }

  try {
    await clover.printOrder(created.id);
  } catch (err) {
    // The order is placed and visible on the Clover device even if the ticket didn't print.
    console.error('Could not print order', created.id, err);
  }

  const view = await getOrderView(created.id, { forKitchen: false });
  if (!view) throw new OrderError('Your order was placed, but we could not load it. Please call us to confirm.', 500);
  return view;
}

export async function getOrderView(id: string, { forKitchen }: { forKitchen: boolean }): Promise<OrderView | null> {
  if (!/^[A-Z0-9]{8,20}$/.test(id)) return null;
  if (!cloverConnected()) {
    const view = getDemoOrder(id);
    if (!view || forKitchen) return view;
    return { ...view, customerName: shortName(view.customerName), customerPhone: undefined };
  }
  try {
    return orderViewFromClover(await clover.getOrder(id), { forKitchen });
  } catch (err) {
    if (err instanceof clover.CloverError && err.status === 404) return null;
    throw err;
  }
}

/** Online orders from the last 12 hours, newest first, for the in-store order screen. */
export async function listKitchenOrders(): Promise<OrderView[]> {
  const since = Date.now() - 12 * 60 * 60_000;
  if (!cloverConnected()) return listDemoOrders(since);
  const orders = await clover.listOrdersSince(since);
  return orders.map((o) => orderViewFromClover(o, { forKitchen: true })).filter((v): v is OrderView => v !== null);
}
