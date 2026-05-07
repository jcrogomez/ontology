import { describe, it, expect } from "vitest";

import {
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
  type Result,
} from "../../../src/runtime/effects/result.js";

// Hand-picked representative values used to exercise the monad laws.
const REP_VALUES: number[] = [0, 1, -3, 42];

// Two non-trivial Kleisli arrows that we'll compose.
const f = (n: number) =>
  n >= 0 ? ok<string>(`+${n}`) : err<"negative">("negative");
const g = (s: string): Result<number, "negative" | "empty"> =>
  s.length === 0 ? err("empty") : ok(s.length);

describe("Result — core constructors and guards", () => {
  it("ok wraps a value", () => {
    expect(ok(7)).toEqual({ tag: "ok", value: 7 });
    expect(isOk(ok(7))).toBe(true);
    expect(isErr(ok(7))).toBe(false);
  });

  it("err wraps an error", () => {
    expect(err("boom")).toEqual({ tag: "err", error: "boom" });
    expect(isErr(err("boom"))).toBe(true);
    expect(isOk(err("boom"))).toBe(false);
  });
});

describe("Result — functor and bind behavior", () => {
  it("mapResult transforms ok values and leaves err untouched", () => {
    expect(mapResult(ok(3), (n) => n * 2)).toEqual(ok(6));
    expect(mapResult(err<"oops">("oops"), (n: number) => n * 2)).toEqual(
      err("oops"),
    );
  });

  it("bindResult chains into ok and short-circuits on err", () => {
    expect(bindResult(ok(3), (n) => ok(n + 1))).toEqual(ok(4));
    expect(bindResult(ok(3), () => err("nope"))).toEqual(err("nope"));
    // Once err is present, the continuation must not run.
    let called = false;
    const res = bindResult(err<"oops">("oops"), (n: number) => {
      called = true;
      return ok(n);
    });
    expect(res).toEqual(err("oops"));
    expect(called).toBe(false);
  });

  it("mapErrResult transforms err and leaves ok untouched", () => {
    expect(mapErrResult(err("boom"), (e) => `wrapped:${e}`)).toEqual(
      err("wrapped:boom"),
    );
    expect(mapErrResult(ok<number>(5), (e: string) => `wrapped:${e}`)).toEqual(
      ok(5),
    );
  });
});

describe("Result — monad laws", () => {
  // Left identity: bind(ok(x), f) ≡ f(x)
  it("left identity holds for representative values", () => {
    for (const x of REP_VALUES) {
      expect(bindResult(ok(x), f)).toEqual(f(x));
    }
  });

  // Right identity: bind(m, ok) ≡ m
  it("right identity holds for ok and err inhabitants", () => {
    const samples: Result<number, "oops">[] = [
      ok(1),
      ok(0),
      ok(-9),
      err("oops"),
    ];
    for (const m of samples) {
      expect(bindResult(m, (x) => ok(x))).toEqual(m);
    }
  });

  // Associativity: bind(bind(m, f), g) ≡ bind(m, x => bind(f(x), g))
  it("associativity holds for ok and err inhabitants", () => {
    const samples: Result<number, "negative" | "empty">[] = [
      ok(0),
      ok(2),
      ok(-5),
      err("empty"),
    ];
    for (const m of samples) {
      const lhs = bindResult(bindResult(m, f), g);
      const rhs = bindResult(m, (x) => bindResult(f(x), g));
      expect(lhs).toEqual(rhs);
    }
  });
});

describe("Result — traverse and sequence", () => {
  it("traverseResult collects all ok results in order", () => {
    const items = [1, 2, 3];
    const res = traverseResult(items, (n) => ok(n * 10));
    expect(res).toEqual(ok([10, 20, 30]));
  });

  it("traverseResult short-circuits on the first err", () => {
    const visited: number[] = [];
    const res = traverseResult([1, 2, 3, 4], (n) => {
      visited.push(n);
      return n === 2 ? err<"stop">("stop") : ok(n);
    });
    expect(res).toEqual(err("stop"));
    // Items after the failing one must not have been visited.
    expect(visited).toEqual([1, 2]);
  });

  it("sequenceResult is traverse with the identity arrow", () => {
    expect(sequenceResult([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]));
    expect(sequenceResult([ok(1), err("nope"), ok(3)])).toEqual(err("nope"));
    expect(sequenceResult([])).toEqual(ok([]));
  });
});

describe("Result — unwrapResult", () => {
  it("returns the ok value", () => {
    expect(unwrapResult(ok(99))).toBe(99);
  });

  it("throws on err", () => {
    expect(() => unwrapResult(err("boom"))).toThrowError(/boom/);
  });
});
