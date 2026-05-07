import { describe, it, expect } from "vitest";
import {
  type AsyncEffectWithLog,
  pureAsyncWithLog,
  failAsyncWithLog,
  mapAsyncWithLog,
  bindAsyncWithLog,
  liftEffectWithLog,
  liftPromiseWithLog,
  runAsyncWithLog,
} from "../../../src/runtime/effects/async.js";
import { ok, err } from "../../../src/runtime/effects/result.js";
import {
  pureWithLog,
  failWithLog,
  logInfo,
  bindWithLog,
} from "../../../src/runtime/effects/io.js";

describe("AsyncEffectWithLog — basics", () => {
  it("pureAsyncWithLog yields an ok with no logs", async () => {
    const r = await runAsyncWithLog(pureAsyncWithLog(7));
    expect(r.value).toEqual(ok(7));
    expect(r.logs).toEqual([]);
  });

  it("failAsyncWithLog yields an err with no logs", async () => {
    const r = await runAsyncWithLog(failAsyncWithLog("nope"));
    expect(r.value).toEqual(err("nope"));
    expect(r.logs).toEqual([]);
  });

  it("mapAsyncWithLog transforms ok and preserves err+logs", async () => {
    const okR = await runAsyncWithLog(mapAsyncWithLog(pureAsyncWithLog(3), (n) => n * 2));
    expect(okR.value).toEqual(ok(6));
    const errR = await runAsyncWithLog(mapAsyncWithLog(failAsyncWithLog<"oops">("oops"), (n: number) => n));
    expect(errR.value).toEqual(err("oops"));
  });
});

describe("AsyncEffectWithLog — bindAsyncWithLog", () => {
  const fE = (n: number): AsyncEffectWithLog<string, "negative"> =>
    n >= 0 ? pureAsyncWithLog(`+${n}`) : failAsyncWithLog("negative");

  it("chains successful effects", async () => {
    const eff = bindAsyncWithLog(pureAsyncWithLog(3), fE);
    const r = await runAsyncWithLog(eff);
    expect(r.value).toEqual(ok("+3"));
  });

  it("short-circuits on err and returns the first leg's logs", async () => {
    let secondCalled = false;
    const first = liftEffectWithLog(
      bindWithLog(logInfo("first attempted"), () => failWithLog<"first_err">("first_err")),
    );
    const second = (s: string): AsyncEffectWithLog<number, "first_err"> => {
      secondCalled = true;
      return pureAsyncWithLog(s.length);
    };
    const r = await runAsyncWithLog(bindAsyncWithLog(first, second));
    expect(r.value).toEqual(err("first_err"));
    expect(secondCalled).toBe(false);
    expect(r.logs.map((l) => l.message)).toEqual(["first attempted"]);
  });

  it("concatenates logs across successful chain steps", async () => {
    const e1 = liftEffectWithLog(
      bindWithLog(logInfo("step 1"), () => pureWithLog(1)),
    );
    const r = await runAsyncWithLog(
      bindAsyncWithLog(e1, (n) =>
        liftEffectWithLog(bindWithLog(logInfo("step 2"), () => pureWithLog(n + 10))),
      ),
    );
    expect(r.value).toEqual(ok(11));
    expect(r.logs.map((l) => l.message)).toEqual(["step 1", "step 2"]);
  });
});

describe("AsyncEffectWithLog — liftPromiseWithLog", () => {
  it("ok branch: surfaces the resolved value, emits one info log", async () => {
    const eff = liftPromiseWithLog<number, "boom">(
      "expensive op",
      async () => 42,
      () => "boom" as const,
    );
    const r = await runAsyncWithLog(eff);
    expect(r.value).toEqual(ok(42));
    expect(r.logs.length).toBe(1);
    expect(r.logs[0].level).toBe("info");
    expect(r.logs[0].message).toMatch(/expensive op/);
  });

  it("err branch: surfaces the mapped error, emits one error log carrying the cause", async () => {
    const eff = liftPromiseWithLog<number, { reason: string }>(
      "expensive op",
      async () => {
        throw new Error("network down");
      },
      (e) => ({ reason: e instanceof Error ? e.message : String(e) }),
    );
    const r = await runAsyncWithLog(eff);
    expect(r.value).toEqual(err({ reason: "network down" }));
    expect(r.logs.length).toBe(1);
    expect(r.logs[0].level).toBe("error");
  });
});

describe("AsyncEffectWithLog — monad laws (under runAsyncWithLog)", () => {
  const REP = [0, 1, -2];
  const fE = (n: number): AsyncEffectWithLog<string, "negative"> =>
    n >= 0 ? pureAsyncWithLog(`+${n}`) : failAsyncWithLog("negative");
  const gE = (s: string): AsyncEffectWithLog<number, "negative" | "empty"> =>
    s.length === 0 ? failAsyncWithLog("empty") : pureAsyncWithLog(s.length);

  it("left identity: bind(pure(x), f) ≡ f(x)", async () => {
    for (const x of REP) {
      const lhs = await runAsyncWithLog(bindAsyncWithLog(pureAsyncWithLog(x), fE));
      const rhs = await runAsyncWithLog(fE(x));
      expect(lhs).toEqual(rhs);
    }
  });

  it("right identity: bind(m, pure) ≡ m", async () => {
    const samples: AsyncEffectWithLog<number, "oops">[] = [
      pureAsyncWithLog(0),
      pureAsyncWithLog(7),
      failAsyncWithLog("oops"),
    ];
    for (const m of samples) {
      const lhs = await runAsyncWithLog(bindAsyncWithLog(m, (x) => pureAsyncWithLog(x)));
      const rhs = await runAsyncWithLog(m);
      expect(lhs).toEqual(rhs);
    }
  });

  it("associativity: bind(bind(m, f), g) ≡ bind(m, x => bind(f(x), g))", async () => {
    const samples: AsyncEffectWithLog<number, "negative" | "empty">[] = [
      pureAsyncWithLog(0),
      pureAsyncWithLog(3),
      pureAsyncWithLog(-1),
    ];
    for (const m of samples) {
      const lhs = await runAsyncWithLog(bindAsyncWithLog(bindAsyncWithLog(m, fE), gE));
      const rhs = await runAsyncWithLog(bindAsyncWithLog(m, (x) => bindAsyncWithLog(fE(x), gE)));
      expect(lhs).toEqual(rhs);
    }
  });
});
