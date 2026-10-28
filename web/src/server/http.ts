import 'server-only';

import { CartError, RequestError } from '@shawarma-bay/core';

import { OrderError } from './ordering';

/**
 * The public ordering endpoints are called by the website and the mobile app. They use no
 * cookies, so any origin may call them (this lets the app's web preview work too).
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function json(data: unknown, init: { status?: number; cors?: boolean; headers?: Record<string, string> } = {}) {
  return Response.json(data, {
    status: init.status ?? 200,
    headers: { 'Cache-Control': 'no-store', ...(init.cors ? CORS_HEADERS : {}), ...init.headers },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '0.0.0.0';
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RequestError('Invalid request.');
  }
}

/** Maps known errors to friendly responses; anything else is logged and hidden. */
export function errorResponse(err: unknown, { cors = true } = {}) {
  if (err instanceof RequestError || err instanceof CartError) {
    return json({ error: err.message }, { status: 400, cors });
  }
  if (err instanceof OrderError) {
    return json({ error: err.message }, { status: err.status, cors });
  }
  console.error(err);
  return json(
    { error: 'Something went wrong on our side. Please try again, or call us to order.' },
    { status: 500, cors },
  );
}

const buckets = new Map<string, number[]>();

/**
 * Best-effort limit on how often one address can hit an endpoint. It lives in memory, so it
 * resets on deploys and isn't shared between server instances.
 */
export function rateLimited(key: string, { max, windowMs }: { max: number; windowMs: number }): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return true;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) {
    for (const [k, times] of buckets) if (times.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return false;
}
