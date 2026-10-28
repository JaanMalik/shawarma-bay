/**
 * Settings that are safe to show in the browser. Next.js inlines NEXT_PUBLIC_ variables at
 * build time, so changing them needs a rebuild (a redeploy on Vercel).
 */

import { ALWAYS_OPEN, restaurant } from '@shawarma-bay/core';

export type CloverEnv = 'sandbox' | 'production';

const cloverEnv: CloverEnv = process.env.NEXT_PUBLIC_CLOVER_ENV === 'production' ? 'production' : 'sandbox';
const merchantId = process.env.NEXT_PUBLIC_CLOVER_MERCHANT_ID ?? '';
const publicKey = process.env.NEXT_PUBLIC_CLOVER_PUBLIC_KEY ?? '';

export const publicConfig = {
  /** Without a Clover merchant the site runs on the built-in menu and a pretend kitchen. */
  demo: merchantId === '',
  cloverEnv,
  merchantId,
  publicKey,
  sdkUrl:
    cloverEnv === 'production' ? 'https://checkout.clover.com/sdk.js' : 'https://checkout.sandbox.dev.clover.com/sdk.js',
  /** Card payments need the Clover ecommerce public key (or demo mode). */
  onlinePayments: process.env.NEXT_PUBLIC_ONLINE_PAYMENTS !== 'off' && (merchantId === '' || publicKey !== ''),
  payAtPickup: process.env.NEXT_PUBLIC_PAY_AT_PICKUP !== 'off',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  /**
   * Hours when online orders are accepted. Demo mode takes orders around the clock so it can
   * be shown at any time; set NEXT_PUBLIC_DEMO_REAL_HOURS=on to use the real hours in demo too.
   */
  orderingHours:
    merchantId === '' && process.env.NEXT_PUBLIC_DEMO_REAL_HOURS !== 'on' ? ALWAYS_OPEN : restaurant.hours,
} as const;
