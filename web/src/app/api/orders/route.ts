import { parseOrderRequest } from '@shawarma-bay/core';

import { publicConfig } from '@/lib/public-config';
import { placeOrder } from '@/server/ordering';
import { clientIp, errorResponse, json, preflight, rateLimited, readJson } from '@/server/http';

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    if (rateLimited(`order:${ip}`, { max: 5, windowMs: 10 * 60_000 })) {
      return json(
        { error: 'Too many orders from this connection. Please call us to place another one.' },
        { status: 429, cors: true },
      );
    }
    const order = parseOrderRequest(await readJson(request), new Date(), publicConfig.orderingHours);
    return json({ order: await placeOrder(order, ip) }, { status: 201, cors: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export const OPTIONS = preflight;
