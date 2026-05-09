# Effect Monad — Design Note

> Status: shipped and integrated. The library ships in PR #111 with proven
> monad laws. PR #115 wires `EffectWithLog` into `compileNode`: dispatch /
> write / parse-validate / runtime-check are now `EffectWithLog` steps
> chained via `bindWithLog`, and the top-level `try/catch` is gone. Partial
> diagnostics survive failure; a step's log is non-empty even when the
> step record reports an error.

## Motivation

The compiler today dispatches steps and accumulates errors via a mix of
`try/catch` blocks and ad-hoc fields scattered across step records. That
works, but it leaves us with two problems:

1. **No principled composition.** Each step decides for itself how to
   handle and report failures, which makes refactors fragile and
   diagnostics inconsistent.
2. **Log/diagnostic data is best-effort.** When a step throws, the partial
   trace it had accumulated is often lost or has to be re-plumbed by hand.

Category theory hands us a clean answer: a **monad** is exactly the
abstract structure for sequencing computations that carry an effect. We
adopt the well-trodden trio:

- `Result<T, E> = T + E`  — disjoint sum / Either
- `Effect<T, E> = () => Result<T, E>`  — `IO ∘ Result` (suspended Result)
- `EffectWithLog<T, E>` — `Writer[LogEntry] ∘ IO ∘ Result` (Result + a
  write-only log channel)

A monad is an endofunctor `T : C -> C` together with two natural
transformations `η : 1 ⇒ T` (unit / `pure`) and `μ : T² ⇒ T`
(multiplication / `join`). Bind is the derived Kleisli composition.

## Operations at a glance

For each layer below, `pure` is `η`, `bind` is the Kleisli composition
`(μ ∘ T(f))`, and `map` is the underlying functor action.

```
Result<T, E>
  ok            : T -> Result<T, never>
  err           : E -> Result<never, E>
  mapResult     : Result<T,E> -> (T->U)             -> Result<U,E>
  bindResult    : Result<T,E> -> (T->Result<U,E>)   -> Result<U,E>
  mapErrResult  : Result<T,E> -> (E->F)             -> Result<T,F>
  traverseResult: T[] -> (T->Result<U,E>)           -> Result<U[],E>
  sequenceResult: Result<T,E>[]                     -> Result<T[],E>

Effect<T, E> = () => Result<T, E>
  pureEffect    : T -> Effect<T, never>
  failEffect    : E -> Effect<never, E>
  mapEffect     : Effect<T,E> -> (T->U)             -> Effect<U,E>
  bindEffect    : Effect<T,E> -> (T->Effect<U,E>)   -> Effect<U,E>
  runEffect     : Effect<T,E>                       -> Result<T,E>

EffectWithLog<T, E> = () => { value: Result<T,E>; logs: LogEntry[] }
  pureWithLog   : T -> EffectWithLog<T, never>
  failWithLog   : E -> EffectWithLog<never, E>
  logInfo/Warn/Error : (msg, data?) -> EffectWithLog<void, never>
  mapWithLog    : EffectWithLog<T,E> -> (T->U)              -> EffectWithLog<U,E>
  bindWithLog   : EffectWithLog<T,E> -> (T->EffectWithLog<U,E>) -> EffectWithLog<U,E>
  runWithLog    : EffectWithLog<T,E>                        -> { value, logs }
```

## The three monad laws

For the **Result** monad (and, by extension, `Effect` and `EffectWithLog`
under their respective `run` equivalences), bind together with `pure` must
satisfy:

### 1. Left identity — `bind(pure(x), f) ≡ f(x)`

```
        pure
   x ─────────► T x
   │            │
   │  f         │ bind(_, f)
   │            ▼
   ▼          T y
  T y  ◄──────── (must coincide)
```

### 2. Right identity — `bind(m, pure) ≡ m`

```
   m  ─bind(_, pure)─►  m'
   ║                    ║
   ╚════════ equal ═════╝
```

### 3. Associativity — `bind(bind(m, f), g) ≡ bind(m, x => bind(f(x), g))`

```
            bind(_, f)         bind(_, g)
   T x ───────────────► T y ───────────────► T z
    │                                        ▲
    │                                        │
    └─────── bind(_, x => bind(f(x), g)) ────┘
```

These laws are exercised in `tests/runtime/effects/result.test.ts` and
`tests/runtime/effects/io.test.ts` on hand-picked representative values
(both `ok` and `err` inhabitants, including a mix of `EffectWithLog`
programs with non-empty logs to verify log-concatenation associativity).

## Usage sketches

> These are illustrative; the compiler does **not** yet use the library.

### Sketch 1 — sequencing fallible work

```ts
import { bindResult, ok, err, type Result } from ".../runtime/effects";

function parsePort(raw: string): Result<number, "not-a-number" | "out-of-range"> {
  const n = Number(raw);
  if (!Number.isFinite(n)) return err("not-a-number");
  if (n < 1 || n > 65535) return err("out-of-range");
  return ok(n);
}

function openSocket(port: number): Result<Socket, "ebusy"> { /* ... */ }

const socket = bindResult(parsePort(input), openSocket);
```

### Sketch 2 — accumulating logs alongside a result

```ts
import { bindWithLog, logInfo, logWarn, pureWithLog, runWithLog }
  from ".../runtime/effects";

const program = bindWithLog(logInfo("compile:start", { node: "n7" }), () =>
  bindWithLog(loadSource("n7"), (src) =>
    bindWithLog(logInfo("compile:loaded", { bytes: src.length }), () =>
      bindWithLog(typecheck(src), (typed) =>
        bindWithLog(logInfo("compile:typed"), () =>
          pureWithLog(typed))))));

const { value, logs } = runWithLog(program);
// `logs` is the full breadcrumb trail, regardless of whether `value`
// is `ok(...)` or `err(...)`.
```

### Sketch 3 — short-circuit propagation

```ts
import { bindResult, traverseResult, ok, err } from ".../runtime/effects";

function compileAll(nodes: Node[]) {
  // The first failure stops the traversal; later nodes are not visited.
  return traverseResult(nodes, (n) =>
    bindResult(loadIntent(n), (intent) =>
      bindResult(typecheck(intent), (typed) =>
        bindResult(emit(typed), (artifact) => ok({ id: n.id, artifact })))));
}
```

## Log accumulation under failure

`bindWithLog` always concatenates logs from the upstream effect with logs
from the downstream effect — including the case where the upstream
effect produced an `err`. In that case the downstream effect is **not
run** (the error short-circuits) but the upstream logs are preserved in
the returned trace.

This corresponds to the Writer-monad transformer composition where the
Writer side of the `(value, logs)` pair is unconditional: bind on the
combined monad concatenates the monoidal log first, then either resolves
the value or aborts. Tests assert this behavior explicitly in
`tests/runtime/effects/io.test.ts` ("preserves logs that were emitted
BEFORE a failing inner effect" and "accumulates logs even when a later
step fails").

## Out of scope for this PR

- **No compiler integration.** `src/runtime/compile/**` is unchanged.
- **No async.** `Effect` is a synchronous `() => Result<…>`. A future
  iteration may add `AsyncEffect = () => Promise<Result<…>>` on the same
  shape — adopting the same laws — without breaking the synchronous
  surface. We deliberately avoided introducing `Promise` here so the
  laws stay easy to reason about and check.
- **No public adoption guidance.** The next milestone replaces the
  compiler's ad-hoc try/catch + result fields with this library, and
  updates `docs/COMPILER.md` accordingly.

## File map

```
src/runtime/effects/
  result.ts   — Result<T, E> + bind/map/mapErr/traverse/sequence
  io.ts       — Effect<T, E> + EffectWithLog<T, E> + log helpers
  laws.ts     — re-exports + pure/fail aliases + law commentary
  index.ts    — public surface (callers import from here)

tests/runtime/effects/
  result.test.ts — Result laws + traverse/sequence behavior
  io.test.ts     — Effect & EffectWithLog laws + log-on-failure tests
```
