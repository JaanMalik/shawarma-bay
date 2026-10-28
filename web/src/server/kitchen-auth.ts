import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { publicConfig } from '@/lib/public-config';

/**
 * The in-store order screen is protected by a PIN (KITCHEN_PIN). Entering it sets a signed
 * cookie that lasts 30 days, so the restaurant's iPad stays signed in.
 */

export const KITCHEN_COOKIE = 'sb_kitchen';
export const KITCHEN_SESSION_DAYS = 30;

export function kitchenPin(): string | null {
  const pin = process.env.KITCHEN_PIN?.trim();
  if (pin) return pin;
  // Demo mode works out of the box; a real setup must choose its own PIN.
  return publicConfig.demo ? '1234' : null;
}

function secret(): string {
  return (
    process.env.KITCHEN_SECRET ||
    createHash('sha256').update(`kitchen:${kitchenPin()}:${process.env.CLOVER_API_TOKEN ?? ''}`).digest('hex')
  );
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPin(input: string): boolean {
  const pin = kitchenPin();
  return pin !== null && safeEqual(input.trim(), pin);
}

export function newSessionValue(now = Date.now()): string {
  const expires = String(now + KITCHEN_SESSION_DAYS * 24 * 60 * 60_000);
  return `${expires}.${sign(expires)}`;
}

export function isValidSession(value: string | undefined, now = Date.now()): boolean {
  if (!value || kitchenPin() === null) return false;
  const [expires, signature] = value.split('.');
  if (!expires || !signature || Number(expires) < now) return false;
  return safeEqual(signature, sign(expires));
}
