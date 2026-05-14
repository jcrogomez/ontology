// Pure transform fixture #2. Predicted: algebraic-lawful +
// pure-transform via /src/runtime/effects/. A tiny Result monad with
// the three laws latent in its construction — chosen to mirror the
// real src/runtime/effects/result.ts surface. Regeneration should
// preserve `ok` and `err` discriminants and the bind/map composition
// behaviour.

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function map<T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

export function bind<T, U, E>(
  r: Result<T, E>,
  f: (t: T) => Result<U, E>,
): Result<U, E> {
  return r.ok ? f(r.value) : r;
}
