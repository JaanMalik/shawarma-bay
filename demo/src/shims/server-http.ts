// The real response helpers, without the per-connection limits: everyone using the demo page
// counts as one connection, so a meeting's worth of test orders would trip them.
export * from '@web/server/http';

export function rateLimited(): boolean {
  return false;
}
