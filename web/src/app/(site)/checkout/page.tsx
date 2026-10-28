import type { Metadata } from 'next';

import { CheckoutForm } from '@/components/checkout-form';

export const metadata: Metadata = { title: 'Checkout' };

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="display mb-6 text-5xl">Checkout</h1>
      <CheckoutForm />
    </div>
  );
}
