'use client';

import Link from 'next/link';

import { formatMoney, restaurant } from '@shawarma-bay/core';

import { Wordmark } from './brand';
import { useCart } from './cart-provider';

export function SiteHeader() {
  const { count, subtotal } = useCart();
  return (
    <header className="sticky top-0 z-30 bg-coal text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-2 sm:gap-4">
          <a href={restaurant.phoneHref} className="hidden text-sm font-semibold text-white/80 hover:text-white sm:block">
            {restaurant.phone}
          </a>
          <Link
            href="/checkout"
            className="btn btn-primary py-2 text-sm"
            aria-label={count > 0 ? `View order, ${count} items` : 'View order'}
          >
            <BagIcon />
            {count > 0 ? (
              <span>
                {count} · {formatMoney(subtotal)}
              </span>
            ) : (
              <span>Order</span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function BagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M5 8h14l-1.2 12H6.2z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}
