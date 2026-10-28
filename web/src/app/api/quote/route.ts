import { parseCartLines } from '@shawarma-bay/core';

import { quote } from '@/server/ordering';
import { clientIp, errorResponse, json, preflight, rateLimited, readJson } from '@/server/http';

export async function POST(request: Request) {
  try {
    if (rateLimited(`quote:${clientIp(request)}`, { max: 60, windowMs: 60_000 })) {
      return json({ error: 'Too many requests. Please wait a moment.' }, { status: 429, cors: true });
    }
    const body = (await readJson(request)) as { lines?: unknown } | null;
    return json(await quote(parseCartLines(body?.lines)), { cors: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export const OPTIONS = preflight;
