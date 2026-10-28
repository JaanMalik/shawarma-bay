import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AppPayment } from '@/components/app-payment';

export const metadata: Metadata = { title: 'Pay for your order', robots: { index: false } };

/** Opened by the mobile app to take a card payment with Clover's secure card fields. */
export default function AppPayPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="display mb-6 text-5xl">Pay for your order</h1>
      <Suspense fallback={<p className="text-smoke">Loading your order…</p>}>
        <AppPayment />
      </Suspense>
    </div>
  );
}
