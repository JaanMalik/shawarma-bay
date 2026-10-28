import { restaurant } from '@shawarma-bay/core';

import { publicConfig } from '@/lib/public-config';
import { json, preflight } from '@/server/http';

/** Lets the mobile app match the website's payment options without an app update. */
export async function GET() {
  return json(
    {
      demo: publicConfig.demo,
      onlinePayments: publicConfig.onlinePayments,
      payAtPickup: publicConfig.payAtPickup,
      /** When online orders are accepted (around the clock in demo mode). */
      orderingHours: publicConfig.orderingHours,
      hours: restaurant.hours,
    },
    { cors: true },
  );
}

export const OPTIONS = preflight;
