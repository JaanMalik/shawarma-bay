import { cookies } from 'next/headers';

import { errorResponse, json } from '@/server/http';
import { KITCHEN_COOKIE, isValidSession } from '@/server/kitchen-auth';
import { listKitchenOrders } from '@/server/ordering';

export async function GET() {
  if (!isValidSession((await cookies()).get(KITCHEN_COOKIE)?.value)) {
    return json({ error: 'Enter the PIN to see orders.' }, { status: 401 });
  }
  try {
    return json({ orders: await listKitchenOrders(), serverTime: new Date().toISOString() });
  } catch (err) {
    return errorResponse(err, { cors: false });
  }
}
