// The browser's Web Crypto covers what the server code uses from node:crypto.
export function randomUUID(): string {
  return crypto.randomUUID();
}
