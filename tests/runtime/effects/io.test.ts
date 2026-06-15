import { describe, it, expect } from "vitest";

import {
  ok,
  err,
  type Result,
} from "../../../src/laws/effects/result.js";
import {
  type Effect,
  pureEffect,
  failEffect,
  mapEffect,
  bindEffect,
  runEffect,
  type EffectWithLog,
  type LogEntry,
  pureWithLog,
  failWithLog,
  logInfo,
  logWarn,
  logError,
  bindWithLog,
  mapWithLog,
  runWithLog,
} from "../../../src/laws/effects/io.js";

// -----------------------------------------------------------------------------
// Effect — basic behavior + monad laws (under runEffect-equivalence)
// -----------------------------------------------------------------------------

const fE = (n: number): Effect<string, "negative"> =>
  n >= 0 ? pureEffect(`+${n}`) : failEffect("negative");
const gE = (s: string): Effect<number, "negative" | "empty"> =>
  s.length === 0 ? failEffect("empty") : pureEffect(s.length);

describe("Effect — laziness and basic ops", () => {
  it("is lazy: constructing pureEffect does not run any side effect", () => {
    let ran = false;
    const eff: Effect<number, never> = () => {
      ran = true;
      return ok(1);
    };
    // Build a pipeline without running it.
    const composed = bindEffect(eff, (n) => pureEffect(n + 1));
    expect(ran).toBe(false);
    const result = runEffect(composed);
    expect(ran).toBe(true);
    expect(result).toEqual(ok(2));
  });

  it("mapEffect transforms success and preserves failure", () => {
    expect(runEffect(mapEffect(pureEffect(3), (n) => n * 2))).toEqual(ok(6));
    expect(runEffect(mapEffect(failEffect("oops"), (n: number) => n))).toEqual(
      err("oops"),
    );
  });

  it("bindEffect short-circuits on failure", () => {
    let called = false;
    const eff = bindEffect(failEffect<"oops">("oops"), (n: number) => {
      called = true;
      return pureEffect(n);
    });
    expect(runEffect(eff)).toEqual(err("oops"));
    expect(called).toBe(false);
  });
});

describe("Effect — monad laws (under runEffect-equivalence)", () => {
  const REP = [0, 1, -2];

  it("left identity: bind(pure(x), f) ≡ f(x)", () => {
    for (const x of REP) {
      const lhs = runEffect(bindEffect(pureEffect(x), fE));
      const rhs = runEffect(fE(x));
      expect(lhs).toEqual(rhs);
    }
  });

  it("right identity: bind(m, pure) ≡ m", () => {
    const samples: Effect<number, "oops">[] = [
      pureEffect(0),
      pureEffect(7),
      failEffect("oops"),
    ];
    for (const m of samples) {
      const lhs = runEffect(bindEffect(m, (x) => pureEffect(x)));
      const rhs = runEffect(m);
      expect(lhs).toEqual(rhs);
    }
  });

  it("associativity: bind(bind(m, f), g) ≡ bind(m, x => bind(f(x), g))", () => {
    const samples: Effect<number, "negative" | "empty">[] = [
      pureEffect(0),
      pureEffect(3),
      pureEffect(-1),
      failEffect("empty"),
    ];
    for (const m of samples) {
      const lhs = runEffect(bindEffect(bindEffect(m, fE), gE));
      const rhs = runEffect(bindEffect(m, (x) => bindEffect(fE(x), gE)));
      expect(lhs).toEqual(rhs);
    }
  });
});

// -----------------------------------------------------------------------------
// EffectWithLog — Writer ∘ Result behavior
// -----------------------------------------------------------------------------

const fL = (n: number): EffectWithLog<string, "negative"> =>
  bindWithLog(logInfo(`f(${n})`), () =>
    n >= 0 ? pureWithLog(`+${n}`) : failWithLog("negative"),
  );
const gL = (s: string): EffectWithLog<number, "negative" | "empty"> =>
  bindWithLog(logInfo(`g(${s})`), () =>
    s.length === 0 ? failWithLog("empty") : pureWithLog(s.length),
  );

describe("EffectWithLog — basic behavior", () => {
  it("logInfo / logWarn / logError emit entries with correct level", () => {
    expect(runWithLog(logInfo("hello", 1))).toEqual({
      value: ok(undefined),
      logs: [{ level: "info", message: "hello", data: 1 }],
    });
    expect(runWithLog(logWarn("careful"))).toEqual({
      value: ok(undefined),
      logs: [{ level: "warn", message: "careful", data: undefined }],
    });
    expect(runWithLog(logError("bad"))).toEqual({
      value: ok(undefined),
      logs: [{ level: "error", message: "bad", data: undefined }],
    });
  });

  it("pureWithLog yields ok with empty logs", () => {
    expect(runWithLog(pureWithLog(42))).toEqual({
      value: ok(42),
      logs: [],
    });
  });

  it("mapWithLog preserves logs and transforms ok value", () => {
    const eff = bindWithLog(logInfo("step"), () => pureWithLog(2));
    const out = runWithLog(mapWithLog(eff, (n) => n * 10));
    expect(out.value).toEqual(ok(20));
    expect(out.logs.map((l) => l.message)).toEqual(["step"]);
  });
});

describe("EffectWithLog — log accumulation under bindWithLog", () => {
  it("concatenates logs in order across successful binds", () => {
    const program = bindWithLog(logInfo("a"), () =>
      bindWithLog(logInfo("b"), () =>
        bindWithLog(logWarn("c"), () => pureWithLog(123)),
      ),
    );
    const out = runWithLog(program);
    expect(out.value).toEqual(ok(123));
    expect(out.logs.map((l) => l.message)).toEqual(["a", "b", "c"]);
    expect(out.logs.map((l) => l.level)).toEqual(["info", "info", "warn"]);
  });

  it("preserves logs that were emitted BEFORE a failing inner effect", () => {
    // Logs are write-only and must survive failure. The downstream effect
    // is not run, but the upstream logs remain in the trace.
    let ranAfter = false;
    const program = bindWithLog(logInfo("before"), () =>
      bindWithLog(failWithLog<"boom">("boom"), () => {
        ranAfter = true;
        return pureWithLog(0);
      }),
    );
    const out = runWithLog(program);
    expect(out.value).toEqual(err("boom"));
    expect(out.logs.map((l) => l.message)).toEqual(["before"]);
    expect(ranAfter).toBe(false);
  });

  it("accumulates logs even when a later step fails", () => {
    const program = bindWithLog(logInfo("step-1"), () =>
      bindWithLog(logWarn("step-2"), () =>
        bindWithLog(failWithLog<"halt">("halt"), () => pureWithLog("never")),
      ),
    );
    const out = runWithLog(program);
    expect(out.value).toEqual(err("halt"));
    expect(out.logs.map((l) => l.message)).toEqual(["step-1", "step-2"]);
  });

  it("does not run the continuation after an err, but keeps prior logs", () => {
    // This is the same property restated against bindWithLog directly.
    const inner: EffectWithLog<number, "stop"> = () => ({
      value: err<"stop">("stop"),
      logs: [{ level: "warn", message: "interrupted" }] as LogEntry[],
    });

    let calls = 0;
    const program = bindWithLog(inner, (n: number) => {
      calls += 1;
      return pureWithLog(n + 1);
    });
    const out = runWithLog(program);
    expect(calls).toBe(0);
    expect(out.value).toEqual(err("stop"));
    expect(out.logs).toEqual([{ level: "warn", message: "interrupted" }]);
  });
});

describe("EffectWithLog — monad laws (under runWithLog-equivalence)", () => {
  const REP = [0, 1, -2];

  it("left identity: bindWithLog(pureWithLog(x), f) ≡ f(x)", () => {
    for (const x of REP) {
      const lhs = runWithLog(bindWithLog(pureWithLog(x), fL));
      const rhs = runWithLog(fL(x));
      expect(lhs.value).toEqual(rhs.value);
      expect(lhs.logs).toEqual(rhs.logs);
    }
  });

  it("right identity: bindWithLog(m, pureWithLog) ≡ m", () => {
    const samples: EffectWithLog<number, "oops">[] = [
      pureWithLog(0),
      pureWithLog(5),
      failWithLog("oops"),
      bindWithLog(logInfo("hi"), () => pureWithLog(9)),
    ];
    for (const m of samples) {
      const lhs = runWithLog(bindWithLog(m, (x) => pureWithLog(x)));
      const rhs = runWithLog(m);
      expect(lhs.value).toEqual(rhs.value);
      expect(lhs.logs).toEqual(rhs.logs);
    }
  });

  it("associativity: bind(bind(m, f), g) ≡ bind(m, x => bind(f(x), g))", () => {
    const samples: EffectWithLog<number, "negative" | "empty">[] = [
      pureWithLog(0),
      pureWithLog(2),
      pureWithLog(-3),
      failWithLog("empty"),
      bindWithLog(logInfo("seed"), () => pureWithLog(4)),
    ];
    for (const m of samples) {
      const lhs = runWithLog(bindWithLog(bindWithLog(m, fL), gL));
      const rhs = runWithLog(bindWithLog(m, (x) => bindWithLog(fL(x), gL)));
      expect(lhs.value).toEqual(rhs.value);
      // Log concatenation must be associative — same logs in same order.
      expect(lhs.logs).toEqual(rhs.logs);
    }
  });
});

describe("EffectWithLog — laziness", () => {
  it("does not run the underlying thunk until runWithLog is called", () => {
    let ran = 0;
    const eff: EffectWithLog<number, never> = () => {
      ran += 1;
      return { value: ok(7), logs: [] };
    };
    const program = bindWithLog(eff, (n) => pureWithLog(n + 1));
    expect(ran).toBe(0);
    const out = runWithLog(program);
    expect(ran).toBe(1);
    expect(out.value).toEqual(ok(8));
  });
});

// Silence unused-import warnings for a re-export referenced for completeness.
void (null as unknown as Result<unknown, unknown>);
