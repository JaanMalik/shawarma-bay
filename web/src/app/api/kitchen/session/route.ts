import { cookies } from 'next/headers';

import { clientIp, errorResponse, json, rateLimited, readJson } from '@/server/http';
import { KITCHEN_COOKIE, KITCHEN_SESSION_DAYS, checkPin, kitchenPin, newSessionValue } from '@/server/kitchen-auth';

/** Signs the order screen in with the PIN. */
export async function POST(request: Request) {
  try {
    if (rateLimited(`pin:${clientIp(request)}`, { max: 10, windowMs: 10 * 60_000 })) {
      return json({ error: 'Too many tries. Wait a few minutes and try again.' }, { status: 429 });
    }
    if (kitchenPin() === null) {
      return json({ error: 'The order screen is not set up yet. Set KITCHEN_PIN on the server.' }, { status: 503 });
    }
    const body = (await readJson(request)) as { pin?: unknown } | null;
    if (typeof body?.pin !== 'string' || !checkPin(body.pin)) {
      return json({ error: 'That PIN is not right.' }, { status: 401 });
    }
    (await cookies()).set(KITCHEN_COOKIE, newSessionValue(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: KITCHEN_SESSION_DAYS * 24 * 60 * 60,
    });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err, { cors: false });
  }
}

export async function DELETE() {
  (await cookies()).delete(KITCHEN_COOKIE);
  return json({ ok: true });
}
