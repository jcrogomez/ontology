/**
 * Result<T, E> — the disjoint sum (a.k.a. Either).
 *
 * This is the underlying carrier of our effect monad. A `Result<T, E>`
 * represents a synchronous computation that either succeeded with a value of
 * type `T` (the `ok` case) or failed with an error of type `E` (the `err`
 * case).
 *
 * Categorically, fixing the error type `E` gives an endofunctor
 *   T_E : Set -> Set,  T_E(X) = X + E
 * with a monad structure (η, μ) where:
 *   η_X(x) = ok(x)                                      (unit / pure)
 *   μ_X : T_E(T_E(X)) -> T_E(X)
 *         μ_X(ok(ok(x)))    = ok(x)
 *         μ_X(ok(err(e)))   = err(e)
 *         μ_X(err(e))       = err(e)                    (multiplication)
 * `bindResult` is the Kleisli composition built from η and μ.
 *
 * The three monad laws are verified explicitly in
 * `tests/runtime/effects/result.test.ts`.
 */

export type Result<T, E> =
  | { readonly tag: "ok"; readonly value: T }
  | { readonly tag: "err"; readonly error: E };

/** η : T -> Result<T, never> — the unit / pure constructor. */
export function ok<T>(value: T): Result<T, never> {
  return { tag: "ok", value };
}

/** Inject a failure into the Result functor. */
export function err<E>(error: E): Result<never, E> {
  return { tag: "err", error };
}

/** Type guard for the success branch. */
export function isOk<T, E>(
  r: Result<T, E>,
): r is { tag: "ok"; value: T } {
  return r.tag === "ok";
}

/** Type guard for the failure branch. */
export function isErr<T, E>(
  r: Result<T, E>,
): r is { tag: "err"; error: E } {
  return r.tag === "err";
}

/**
 * Functorial map: transforms the success value, leaving errors untouched.
 * `mapResult(ok(x), f) = ok(f(x))` and `mapResult(err(e), f) = err(e)`.
 */
export function mapResult<T, E, U>(
  r: Result<T, E>,
  f: (t: T) => U,
): Result<U, E> {
  return r.tag === "ok" ? ok(f(r.value)) : r;
}

/**
 * Monadic bind (a.k.a. flatMap, `>>=`).
 *
 * `bindResult(r, f)` runs `f` on the success value of `r`; if `r` is an
 * error, the error short-circuits and `f` is never called. This is exactly
 * the Kleisli composition for the Result monad.
 */
export function bindResult<T, E, U>(
  r: Result<T, E>,
  f: (t: T) => Result<U, E>,
): Result<U, E> {
  return r.tag === "ok" ? f(r.value) : r;
}

/**
 * Map over the error channel. Useful for adapting errors between layers
 * without changing the success type.
 */
export function mapErrResult<T, E, F>(
  r: Result<T, E>,
  f: (e: E) => F,
): Result<T, F> {
  return r.tag === "ok" ? r : err(f(r.error));
}

/**
 * Traverse: apply a Kleisli arrow `f` to each item, short-circuiting on the
 * first error. Equivalent to `sequenceResult(items.map(f))` but avoids
 * allocating the intermediate array of Results.
 */
export function traverseResult<T, U, E>(
  items: readonly T[],
  f: (t: T) => Result<U, E>,
): Result<U[], E> {
  const out: U[] = [];
  for (const item of items) {
    const r = f(item);
    if (r.tag === "err") return r;
    out.push(r.value);
  }
  return ok(out);
}

/**
 * Sequence: turn an array of Results into a Result of an array,
 * short-circuiting on the first error.
 */
export function sequenceResult<T, E>(items: readonly Result<T, E>[]): Result<T[], E> {
  return traverseResult(items, (r) => r);
}

/**
 * Convenience: extract the success value or throw. Reserved for callers at
 * the very edge of the system where a failure really is exceptional.
 */
export function unwrapResult<T, E>(r: Result<T, E>): T {
  if (r.tag === "ok") return r.value;
  throw new Error(`unwrapResult on err: ${String(r.error)}`);
}
