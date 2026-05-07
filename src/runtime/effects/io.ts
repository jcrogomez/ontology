/**
 * Effect<T, E> and EffectWithLog<T, E>.
 *
 * `Effect<T, E>` is a thin lazy-thunk wrapper around `Result<T, E>` — it
 * suspends a (synchronous, deterministic-modulo-its-arguments) computation
 * so that we can compose it before running it. As a monad it is essentially
 * `Reader<unit, Result<T, E>>` or, equivalently, `IO ∘ Result`.
 *
 * `EffectWithLog<T, E>` adds a Writer channel for `LogEntry` values. The
 * monad is the composition `Writer[LogEntry] ∘ IO ∘ Result`. Logs are
 * write-only and *survive failure*: when the inner Result is `err`, the
 * accumulated logs are still preserved (this is essential for diagnostics
 * and is exercised by tests).
 *
 * The monad laws (left identity, right identity, associativity) are
 * verified for both `Effect` and `EffectWithLog` in
 * `tests/runtime/effects/io.test.ts`.
 */

import {
  type Result,
  ok,
  err,
  bindResult,
  mapResult,
} from "./result.js";

// ---------------------------------------------------------------------------
// Effect<T, E> — IO ∘ Result
// ---------------------------------------------------------------------------

/**
 * A suspended computation that, when run, yields a `Result<T, E>`.
 *
 * The thunk is expected to be referentially transparent up to its captured
 * arguments; running it more than once should produce equivalent results.
 */
export type Effect<T, E> = () => Result<T, E>;

/** η : T -> Effect<T, never> */
export function pureEffect<T>(value: T): Effect<T, never> {
  return () => ok(value);
}

/** Inject a failure: η_err : E -> Effect<never, E> */
export function failEffect<E>(error: E): Effect<never, E> {
  return () => err(error);
}

/** Functorial map. Errors pass through untouched. */
export function mapEffect<T, E, U>(
  eff: Effect<T, E>,
  f: (t: T) => U,
): Effect<U, E> {
  return () => mapResult(eff(), f);
}

/**
 * Monadic bind. `f` is *only* invoked when the upstream effect succeeds.
 * On failure the error short-circuits without re-running the effect.
 */
export function bindEffect<T, E, U>(
  eff: Effect<T, E>,
  f: (t: T) => Effect<U, E>,
): Effect<U, E> {
  return () => bindResult(eff(), (t) => f(t)());
}

/** Run a suspended effect, returning the underlying Result. */
export function runEffect<T, E>(eff: Effect<T, E>): Result<T, E> {
  return eff();
}

// ---------------------------------------------------------------------------
// EffectWithLog<T, E> — Writer[LogEntry] ∘ IO ∘ Result
// ---------------------------------------------------------------------------

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly data?: unknown;
}

export interface LogResult<T, E> {
  readonly value: Result<T, E>;
  readonly logs: readonly LogEntry[];
}

/**
 * A suspended computation that yields a `Result` *and* a log trace.
 *
 * The Writer monoid here is the free monoid on `LogEntry` (i.e. arrays
 * concatenated), with identity `[]`. `bindWithLog` always concatenates logs,
 * even when the second leg is skipped due to an error in the first — this
 * is the crucial property that lets diagnostics survive failures.
 */
export type EffectWithLog<T, E> = () => LogResult<T, E>;

const NO_LOGS: readonly LogEntry[] = Object.freeze([]);

/** η : T -> EffectWithLog<T, never> with empty log. */
export function pureWithLog<T>(value: T): EffectWithLog<T, never> {
  return () => ({ value: ok(value), logs: NO_LOGS });
}

/** Inject a failure with empty log. */
export function failWithLog<E>(error: E): EffectWithLog<never, E> {
  return () => ({ value: err(error), logs: NO_LOGS });
}

/** Emit a single log entry; resolves to `ok(undefined)`. */
export function logEntry(entry: LogEntry): EffectWithLog<void, never> {
  return () => ({ value: ok(undefined), logs: [entry] });
}

export function logInfo(
  message: string,
  data?: unknown,
): EffectWithLog<void, never> {
  return logEntry({ level: "info", message, data });
}

export function logWarn(
  message: string,
  data?: unknown,
): EffectWithLog<void, never> {
  return logEntry({ level: "warn", message, data });
}

export function logError(
  message: string,
  data?: unknown,
): EffectWithLog<void, never> {
  return logEntry({ level: "error", message, data });
}

/** Functorial map over the success channel; logs and errors are preserved. */
export function mapWithLog<T, E, U>(
  eff: EffectWithLog<T, E>,
  f: (t: T) => U,
): EffectWithLog<U, E> {
  return () => {
    const { value, logs } = eff();
    return { value: mapResult(value, f), logs };
  };
}

/**
 * Monadic bind for the Writer ∘ Result monad.
 *
 * Crucially, when the first effect fails the second effect is *not* run,
 * but the first effect's logs are still returned. This matches the
 * categorical Writer-Monad transformer composition: the Writer side of the
 * pair is unconditional.
 */
export function bindWithLog<T, E, U>(
  eff: EffectWithLog<T, E>,
  f: (t: T) => EffectWithLog<U, E>,
): EffectWithLog<U, E> {
  return () => {
    const first = eff();
    if (first.value.tag === "err") {
      return { value: first.value, logs: first.logs };
    }
    const second = f(first.value.value)();
    const logs: LogEntry[] = [...first.logs, ...second.logs];
    return { value: second.value, logs };
  };
}

/** Run a logged effect, returning the value-and-logs pair. */
export function runWithLog<T, E>(eff: EffectWithLog<T, E>): LogResult<T, E> {
  return eff();
}
