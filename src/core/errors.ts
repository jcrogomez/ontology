// Centralized helper for converting an `unknown` thrown value into a printable string.
// Catches in TypeScript receive `unknown` since the language cannot guarantee what was
// thrown. Without this helper, callers either reach for `(err as Error).message` (which
// returns `undefined` if a non-Error was thrown) or duplicate the same `instanceof` check
// across every catch site.

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
