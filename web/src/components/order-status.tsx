'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { formatMoney, restaurant, type OrderView } from '@shawarma-bay/core';

import { fetchOrder } from '@/lib/api-client';

export function OrderStatus() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOrder(id)
      .then(({ order }) => !cancelled && setOrder(order))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="card p-8 text-center">
        <h1 className="display text-4xl">Order not found</h1>
        <p className="mt-2 text-smoke">{error}</p>
        <a href={restaurant.phoneHref} className="btn btn-primary mt-6">
          Call {restaurant.phone}
        </a>
      </div>
    );
  }
  if (!order) return <div className="card h-96 animate-pulse" aria-label="Loading your order" />;

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        <div className="bg-coal px-6 py-8 text-white sm:px-8">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-herb">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="display mt-4 text-5xl">Thanks, {order.customerName.split(' ')[0]}!</h1>
          <p className="mt-2 text-white/80">Your order is in and the kitchen has it.</p>
        </div>
        <dl className="grid gap-4 px-6 py-6 sm:grid-cols-3 sm:px-8">
          <Fact label="Pickup" value={order.pickupLabel} />
          <Fact label="Order" value={`#${order.id.slice(-4)}`} />
          <Fact
            label="Payment"
            value={order.paidOnline ? `Paid ${formatMoney(order.total)}` : `Pay ${formatMoney(order.total)} at pickup`}
          />
        </dl>
      </div>

      <div className="card p-6 sm:p-8">
        <h2 className="display text-2xl">What you ordered</h2>
        <ul className="mt-4 space-y-3">
          {order.lines.map((line, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>
                <span className="font-semibold">
                  {line.quantity} × {line.name}
                </span>
                {line.modifiers.length > 0 && <span className="block text-sm text-smoke">{line.modifiers.join(', ')}</span>}
                {line.note && <span className="block text-sm italic text-smoke">“{line.note}”</span>}
              </span>
              <span className="tabular-nums">{formatMoney(line.total)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
          <Row label="Subtotal" value={formatMoney(order.subtotal)} />
          <Row label="Tax" value={formatMoney(order.tax)} />
          {order.tip > 0 && <Row label="Tip" value={formatMoney(order.tip)} />}
          <div className="flex justify-between pt-2 text-lg font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(order.total)}</dd>
          </div>
        </dl>
      </div>

      <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="font-semibold">
            {restaurant.name}, {restaurant.address.line1}
          </p>
          <p className="text-sm text-smoke">
            {restaurant.address.city}, {restaurant.address.state} {restaurant.address.zip}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={restaurant.mapsUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
            Directions
          </a>
          <a href={restaurant.phoneHref} className="btn btn-ghost">
            Call
          </a>
        </div>
      </div>

      <p className="text-center">
        <Link href="/" className="font-semibold text-ember-deep hover:underline">
          Back to the menu
        </Link>
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-smoke">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-smoke">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
