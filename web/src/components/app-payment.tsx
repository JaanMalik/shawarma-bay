'use client';

import { useSearchParams } from 'next/navigation';

import { decodeHandoff } from '@shawarma-bay/core';

import { AppPayForm } from './checkout-form';

export function AppPayment() {
  const encoded = useSearchParams().get('order');
  const handoff = encoded ? decodeHandoff(encoded) : null;
  if (!handoff) {
    return <p className="card p-6">This payment link is incomplete. Go back to the app and try again.</p>;
  }
  return <AppPayForm handoff={handoff} />;
}
