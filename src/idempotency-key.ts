/** A new key for one mutating call. Send the same key again only when you repeat that same call. */
export function idempotencyKey(): string {
  return crypto.randomUUID();
}
