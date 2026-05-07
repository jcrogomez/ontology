/**
 * Laws & convenience re-exports.
 *
 * This module is named "laws" because it documents (and re-exports the
 * surface that we use to verify) the three monad laws our effect modules
 * must satisfy. The laws themselves are checked in
 * `tests/runtime/effects/result.test.ts` and `tests/runtime/effects/io.test.ts`.
 *
 * For the Result monad, with η = ok and bind = bindResult:
 *
 *   1. Left identity:    bind(ok(x), f)        ≡  f(x)
 *   2. Right identity:   bind(m, ok)           ≡  m
 *   3. Associativity:    bind(bind(m, f), g)   ≡  bind(m, x => bind(f(x), g))
 *
 * For Effect<T, E> the laws hold up to *observable equivalence under
 * `runEffect`*: two effects are considered equal iff their results are
 * equal. Likewise for EffectWithLog under `runWithLog`, where equality
 * compares both the value and the (concatenated) log trace.
 */

export {
  type Result,
  ok,
  err,
  isOk,
  isErr,
  mapResult,
  bindResult,
  mapErrResult,
  traverseResult,
  sequenceResult,
  unwrapResult,
} from "./result.js";

export {
  type Effect,
  pureEffect,
  failEffect,
  mapEffect,
  bindEffect,
  runEffect,
  type LogLevel,
  type LogEntry,
  type LogResult,
  type EffectWithLog,
  pureWithLog,
  failWithLog,
  logEntry,
  logInfo,
  logWarn,
  logError,
  mapWithLog,
  bindWithLog,
  runWithLog,
} from "./io.js";

import type { Effect } from "./io.js";
import type { EffectWithLog } from "./io.js";
import { pureEffect } from "./io.js";
import { pureWithLog } from "./io.js";

/**
 * Aliases preferred by callers that want the canonical category-theory
 * names. `pure` is the unit η; `fail` is the algebraic embedding of an
 * error into the effect functor.
 */
export const pure: <T>(v: T) => Effect<T, never> = pureEffect;
export const pureLogged: <T>(v: T) => EffectWithLog<T, never> = pureWithLog;
