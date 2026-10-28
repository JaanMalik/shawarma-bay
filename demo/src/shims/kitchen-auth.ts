/** The order screen's PIN check without server secrets. The demo PIN is 1234, as on the site. */

export const KITCHEN_COOKIE = 'sb_kitchen';
export const KITCHEN_SESSION_DAYS = 30;

const PIN = '1234';

export function kitchenPin(): string | null {
  return PIN;
}

export function checkPin(input: string): boolean {
  return input.trim() === PIN;
}

export function newSessionValue(now = Date.now()): string {
  return `${now + KITCHEN_SESSION_DAYS * 24 * 60 * 60_000}.demo`;
}

export function isValidSession(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [expires, mark] = value.split('.');
  return mark === 'demo' && Number(expires) > now;
}
