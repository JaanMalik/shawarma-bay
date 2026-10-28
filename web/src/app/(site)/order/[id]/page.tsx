import type { Metadata } from 'next';
import { Suspense } from 'react';

import { OrderStatus } from '@/components/order-status';

export const metadata: Metadata = { title: 'Your order' };

export default function OrderPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <Suspense fallback={<div className="card h-96 animate-pulse" aria-label="Loading your order" />}>
        <OrderStatus />
      </Suspense>
    </div>
  );
}
