// AsyncEffectWithLog<T, E>.
//
// The Promise-typed sibling of `EffectWithLog`. Same semantics — Writer ∘
// Result composition where logs survive failure — but the carrier is a
// Promise so callers can compose synchronous and asynchronous slices in
// one pipeline.
//
// Library design follows the existing `EffectWithLog` line-for-line:
//   • `pureAsyncWithLog(v)` returns an async ok with no logs.
//   • `failAsyncWithLog(e)` returns an async err with no logs.
//   • `bindAsyncWithLog(eff, f)` chains; logs always concatenate, even
//     when the first leg fails (Writer side is unconditional).
//   • `liftEffectWithLog(sync)` lifts a synchronous EffectWithLog into the
//     async one — the bridge between the two layers.
//   • `liftPromiseWithLog(label, fn, mapErr)` wraps a raw Promise into an
//     AsyncEffectWithLog: success → ok with one log entry; rejection →
//     err with one log entry, error mapped via `mapErr`. This is the
//     boundary where try/catch finally lives so callers above never need
//     it.
//
// The monad laws hold by structural delegation to the underlying
// EffectWithLog laws; tests verify them at representative values.

import {
  type Result,
  ok,
  err,
} from "./result.js";
import {
  type EffectWithLog,
  type LogEntry,
  type LogResult,
  runWithLog,
} from "./io.js";

export type AsyncEffectWithLog<T, E> = () => Promise<LogResult<T, E>>;

const NO_LOGS: readonly LogEntry[] = Object.freeze([]);

export function pureAsyncWithLog<T>(value: T): AsyncEffectWithLog<T, never> {
  return async () => ({ value: ok(value), logs: NO_LOGS });
}

export function failAsyncWithLog<E>(error: E): AsyncEffectWithLog<never, E> {
  return async () => ({ value: err(error), logs: NO_LOGS });
}

export function mapAsyncWithLog<T, E, U>(
  eff: AsyncEffectWithLog<T, E>,
  f: (t: T) => U,
): AsyncEffectWithLog<U, E> {
  return async () => {
    const { value, logs } = await eff();
    if (value.tag === "err") return { value, logs };
    return { value: ok(f(value.value)), logs };
  };
}

// Async monadic bind. The Writer side is unconditional: even when the
// first leg fails, its logs are returned.
export function bindAsyncWithLog<T, E, U>(
  eff: AsyncEffectWithLog<T, E>,
  f: (t: T) => AsyncEffectWithLog<U, E>,
): AsyncEffectWithLog<U, E> {
  return async () => {
    const first = await eff();
    if (first.value.tag === "err") {
      return { value: first.value, logs: first.logs };
    }
    const second = await f(first.value.value)();
    return {
      value: second.value,
      logs: [...first.logs, ...second.logs],
    };
  };
}

// Lift a synchronous EffectWithLog into the async carrier. The lifted
// effect retains its logs and outcome unchanged.
export function liftEffectWithLog<T, E>(
  sync: EffectWithLog<T, E>,
): AsyncEffectWithLog<T, E> {
  return async () => runWithLog(sync);
}

// Wrap a raw Promise-returning function into an AsyncEffectWithLog with
// principled error mapping. The Promise's rejection is caught here — the
// only place try/catch is allowed inside this library — and translated
// into the typed `E` channel via `mapErr`. Both legs emit one log entry
// describing what was attempted (for diagnostics; the entry is always
// present).
export function liftPromiseWithLog<T, E>(
  label: string,
  fn: () => Promise<T>,
  mapErr: (e: unknown) => E,
): AsyncEffectWithLog<T, E> {
  return async () => {
    try {
      const v = await fn();
      return {
        value: ok(v),
        logs: [{ level: "info", message: `${label}: ok` }],
      };
    } catch (raw) {
      return {
        value: err(mapErr(raw)),
        logs: [{ level: "error", message: `${label}: failed`, data: raw }],
      };
    }
  };
}

export async function runAsyncWithLog<T, E>(
  eff: AsyncEffectWithLog<T, E>,
): Promise<LogResult<T, E>> {
  return eff();
}

// Convenience accessor: drop the typed-result discrimination and surface
// just the value / failure as the caller's plain shape. Used at the seams
// where compileNode translates an internal LogResult into its public
// `CompileNodeResult` (which carries a string-typed reason). Returns
// undefined on the err side so the caller can inspect `lr.value.error`
// directly when it needs the typed payload.
export function logsOf<T, E>(lr: LogResult<T, E>): readonly LogEntry[] {
  return lr.logs;
}

// Re-export Result-side helpers callers use frequently. Keeps imports
// tidy: a sub-step author imports everything from `./async.js` instead
// of mixing two paths.
export { type Result, ok, err } from "./result.js";
