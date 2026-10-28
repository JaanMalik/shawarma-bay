import { getOrderView } from '@/server/ordering';
import { errorResponse, json, preflight } from '@/server/http';

export async function GET(_request: Request, ctx: RouteContext<'/api/orders/[id]'>) {
  try {
    const { id } = await ctx.params;
    const order = await getOrderView(id, { forKitchen: false });
    if (!order) return json({ error: 'We could not find that order.' }, { status: 404, cors: true });
    return json({ order }, { cors: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export const OPTIONS = preflight;
