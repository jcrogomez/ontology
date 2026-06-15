/**
 * Public surface of the effect-monad library.
 *
 * Callers should import from `./runtime/effects` (or the absolute path
 * equivalent) and not reach into individual files. The split between
 * `result.ts`, `io.ts`, and `laws.ts` is an internal organization detail.
 *
 * Note: this module is intentionally NOT yet wired into the compiler. The
 * compiler still uses try/catch + ad-hoc result fields. Adopting the
 * effect monad inside the compile pipeline is the next milestone — see
 * `docs/design/laws/EFFECT_MONAD.md` for context.
 */

export {
  // Result core
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

  // Effect (lazy Result)
  type Effect,
  pureEffect,
  failEffect,
  mapEffect,
  bindEffect,
  runEffect,

  // EffectWithLog (Writer ∘ IO ∘ Result)
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

  // Aliases
  pure,
  pureLogged,
} from "./laws.js";
