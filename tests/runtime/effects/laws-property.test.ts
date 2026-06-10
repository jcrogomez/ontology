import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  ok,
  err,
  mapResult,
  bindResult,
  type Result,
} from "../../../src/runtime/effects/result.js";
import {
  bindEffect,
  runEffect,
  pureWithLog,
  bindWithLog,
  runWithLog,
  type Effect,
  type EffectWithLog,
  type LogEntry,
  type LogResult,
} from "../../../src/runtime/effects/io.js";
import {
  bindAsyncWithLog,
  liftEffectWithLog,
  runAsyncWithLog,
  type AsyncEffectWithLog,
} from "../../../src/runtime/effects/async.js";

// Property-based companions to result.test.ts / io.test.ts / async.test.ts.
// Those files pin the monad laws at hand-picked representatives; here the
// same laws run over randomised values, errors AND randomised Kleisli arrows
// (fc.func), which is what MATHEMATICAL_CLAIMS.md §3.6 recommends to widen
// the T1 coverage. Equality is structural (toEqual), matching the laws'
// statements "up to observable equivalence" under run*.

type V = unknown;
type E = string;

const arbValue: fc.Arbitrary<V> = fc.oneof(
  fc.integer(),
  fc.string(),
  fc.double({ noNaN: true }),
  fc.array(fc.integer(), { maxLength: 4 }),
  fc.dictionary(fc.string({ maxLength: 4 }), fc.integer(), { maxKeys: 3 }),
);
const arbError: fc.Arbitrary<E> = fc.string();
const arbResult: fc.Arbitrary<Result<V, E>> = fc.oneof(
  arbValue.map((v) => ok(v) as Result<V, E>),
  arbError.map((e) => err(e) as Result<V, E>),
);
// A randomised Kleisli arrow V -> Result<V, E> (deterministic per input).
const arbKleisli: fc.Arbitrary<(x: V) => Result<V, E>> = fc.func(arbResult);
const arbEndo: fc.Arbitrary<(x: V) => V> = fc.func(arbValue);

describe("Result — monad laws over randomised inputs (T1, §3.6)", () => {
  it("left identity: bind(ok(x), f) ≡ f(x)", () => {
    fc.assert(
      fc.property(arbValue, arbKleisli, (x, f) => {
        expect(bindResult(ok(x), f)).toEqual(f(x));
      }),
    );
  });

  it("right identity: bind(m, ok) ≡ m", () => {
    fc.assert(
      fc.property(arbResult, (m) => {
        expect(bindResult(m, (x) => ok(x))).toEqual(m);
      }),
    );
  });

  it("associativity: bind(bind(m, f), g) ≡ bind(m, x => bind(f(x), g))", () => {
    fc.assert(
      fc.property(arbResult, arbKleisli, arbKleisli, (m, f, g) => {
        expect(bindResult(bindResult(m, f), g)).toEqual(
          bindResult(m, (x) => bindResult(f(x), g)),
        );
      }),
    );
  });

  it("functor identity: map(m, id) ≡ m", () => {
    fc.assert(
      fc.property(arbResult, (m) => {
        expect(mapResult(m, (x) => x)).toEqual(m);
      }),
    );
  });

  it("functor composition: map(m, g∘f) ≡ map(map(m, f), g)", () => {
    fc.assert(
      fc.property(arbResult, arbEndo, arbEndo, (m, f, g) => {
        expect(mapResult(m, (x) => g(f(x)))).toEqual(mapResult(mapResult(m, f), g));
      }),
    );
  });
});

// Effect — same laws observed under runEffect. Effects are lazy thunks, so
// the arbitraries wrap a generated Result; arrows wrap a generated function.
const arbEffect: fc.Arbitrary<Effect<V, E>> = arbResult.map((r) => () => r);
const arbKleisliEffect: fc.Arbitrary<(x: V) => Effect<V, E>> = fc
  .func(arbResult)
  .map((f) => (x: V) => () => f(x));

describe("Effect — monad laws up to runEffect over randomised inputs", () => {
  it("left identity", () => {
    fc.assert(
      fc.property(arbValue, arbKleisliEffect, (x, f) => {
        const pure: Effect<V, E> = () => ok(x);
        expect(runEffect(bindEffect(pure, f))).toEqual(runEffect(f(x)));
      }),
    );
  });

  it("right identity", () => {
    fc.assert(
      fc.property(arbEffect, (m) => {
        expect(runEffect(bindEffect(m, (x) => () => ok(x)))).toEqual(runEffect(m));
      }),
    );
  });

  it("associativity", () => {
    fc.assert(
      fc.property(arbEffect, arbKleisliEffect, arbKleisliEffect, (m, f, g) => {
        const lhs = runEffect(bindEffect(bindEffect(m, f), g));
        const rhs = runEffect(bindEffect(m, (x) => bindEffect(f(x), g)));
        expect(lhs).toEqual(rhs);
      }),
    );
  });
});

// EffectWithLog — Writer ∘ IO ∘ Result. Laws compare BOTH channels (value
// and logs) under runWithLog; the Writer monoid is array concatenation.
const arbLogs: fc.Arbitrary<LogEntry[]> = fc.array(
  fc.record({
    level: fc.constantFrom("info" as const, "warn" as const, "error" as const),
    message: fc.string({ maxLength: 8 }),
  }),
  { maxLength: 3 },
);
const arbLogResult: fc.Arbitrary<LogResult<V, E>> = fc.record({
  value: arbResult,
  logs: arbLogs,
});
const arbEffL: fc.Arbitrary<EffectWithLog<V, E>> = arbLogResult.map((lr) => () => lr);
const arbKleisliL: fc.Arbitrary<(x: V) => EffectWithLog<V, E>> = fc
  .func(arbLogResult)
  .map((f) => (x: V) => () => f(x));

describe("EffectWithLog — monad + Writer laws over randomised inputs", () => {
  it("left identity (value and logs): bind(pure(x), f) ≡ f(x)", () => {
    fc.assert(
      fc.property(arbValue, arbKleisliL, (x, f) => {
        expect(runWithLog(bindWithLog(pureWithLog(x), f))).toEqual(runWithLog(f(x)));
      }),
    );
  });

  it("right identity (value and logs): bind(m, pure) ≡ m", () => {
    fc.assert(
      fc.property(arbEffL, (m) => {
        expect(runWithLog(bindWithLog(m, (x) => pureWithLog(x)))).toEqual(
          runWithLog(m),
        );
      }),
    );
  });

  it("associativity, including log-concat associativity", () => {
    fc.assert(
      fc.property(arbEffL, arbKleisliL, arbKleisliL, (m, f, g) => {
        const lhs = runWithLog(bindWithLog(bindWithLog(m, f), g));
        const rhs = runWithLog(bindWithLog(m, (x) => bindWithLog(f(x), g)));
        expect(lhs.value).toEqual(rhs.value);
        expect(lhs.logs).toEqual(rhs.logs);
      }),
    );
  });

  it("Writer side is unconditional: m's logs are always a prefix; on err the continuation never runs", () => {
    fc.assert(
      fc.property(arbEffL, arbKleisliL, (m, f) => {
        let continuationRan = false;
        const tracked = (x: V): EffectWithLog<V, E> => {
          continuationRan = true;
          return f(x);
        };
        const base = runWithLog(m);
        const out = runWithLog(bindWithLog(m, tracked));
        expect(out.logs.slice(0, base.logs.length)).toEqual([...base.logs]);
        if (base.value.tag === "err") {
          expect(out).toEqual(base);
          expect(continuationRan).toBe(false);
        }
      }),
    );
  });
});

// AsyncEffectWithLog — same laws on the Promise carrier, plus coherence of
// the lift: lifting a sync EffectWithLog must not change what is observed.
const arbAsyncEffL: fc.Arbitrary<AsyncEffectWithLog<V, E>> = arbLogResult.map(
  (lr) => async () => lr,
);
const arbKleisliAsync: fc.Arbitrary<(x: V) => AsyncEffectWithLog<V, E>> = fc
  .func(arbLogResult)
  .map((f) => (x: V) => async () => f(x));

describe("AsyncEffectWithLog — monad laws over randomised inputs", () => {
  it("left identity", async () => {
    await fc.assert(
      fc.asyncProperty(arbValue, arbKleisliAsync, async (x, f) => {
        const pure: AsyncEffectWithLog<V, E> = async () => ({
          value: ok(x),
          logs: [],
        });
        expect(await runAsyncWithLog(bindAsyncWithLog(pure, f))).toEqual(
          await runAsyncWithLog(f(x)),
        );
      }),
    );
  });

  it("right identity", async () => {
    await fc.assert(
      fc.asyncProperty(arbAsyncEffL, async (m) => {
        const viaBind = await runAsyncWithLog(
          bindAsyncWithLog(m, (x) => async () => ({ value: ok(x), logs: [] })),
        );
        expect(viaBind).toEqual(await runAsyncWithLog(m));
      }),
    );
  });

  it("associativity, including log-concat associativity", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbAsyncEffL,
        arbKleisliAsync,
        arbKleisliAsync,
        async (m, f, g) => {
          const lhs = await runAsyncWithLog(bindAsyncWithLog(bindAsyncWithLog(m, f), g));
          const rhs = await runAsyncWithLog(
            bindAsyncWithLog(m, (x) => bindAsyncWithLog(f(x), g)),
          );
          expect(lhs.value).toEqual(rhs.value);
          expect(lhs.logs).toEqual(rhs.logs);
        },
      ),
    );
  });

  it("lift coherence: runAsync(lift(m)) observes exactly runWithLog(m)", async () => {
    await fc.assert(
      fc.asyncProperty(arbEffL, async (m) => {
        expect(await runAsyncWithLog(liftEffectWithLog(m))).toEqual(runWithLog(m));
      }),
    );
  });
});
