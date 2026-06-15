import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0019 — src/runtime/effects/result.ts
// Tested entries: bindResult, traverseResult, sequenceResult — the monadic
// plumbing of the effect layer. The cases pin the short-circuit semantics
// (err stops evaluation, the Kleisli arrow is never called past the first
// failure, first error wins) that a regen could plausibly relax into
// "collect all errors" or "keep mapping after failure".

type R = { tag: "ok"; value: unknown } | { tag: "err"; error: unknown };

type ResultApi = {
  bindResult: (r: R, f: (t: unknown) => R) => R;
  traverseResult: (items: readonly unknown[], f: (t: unknown) => R) => R;
  sequenceResult: (items: readonly R[]) => R;
};

export const cases: BehaviorCase[] = [
  {
    name: "bindResult — err short-circuits and the Kleisli arrow never runs",
    setup: () => ({ error: "boom" }),
    invoke: (api, ctx) => {
      let fCalled = false;
      const result = (api as ResultApi).bindResult(
        { tag: "err", error: (ctx as { error: string }).error },
        () => {
          fCalled = true;
          return { tag: "ok", value: 1 };
        },
      );
      return { result, fCalled };
    },
    assert: (r) => {
      const v = r as { result: R; fCalled: boolean };
      return !v.fCalled && v.result.tag === "err" && (v.result as { error: unknown }).error === "boom";
    },
  },
  {
    name: "traverseResult — stops at first err, later items not visited",
    setup: () => ({ items: [1, 2, 3, 4] }),
    invoke: (api, ctx) => {
      const visited: number[] = [];
      const result = (api as ResultApi).traverseResult(
        (ctx as { items: number[] }).items,
        (n) => {
          visited.push(n as number);
          return n === 2
            ? { tag: "err", error: `stop@${n}` }
            : { tag: "ok", value: (n as number) * 10 };
        },
      );
      return { result, visited };
    },
    assert: (r) => {
      const v = r as { result: R; visited: number[] };
      return (
        v.result.tag === "err" &&
        (v.result as { error: unknown }).error === "stop@2" &&
        v.visited.length === 2
      );
    },
  },
  {
    name: "sequenceResult — all-ok collects values in order",
    setup: () => ({
      items: [
        { tag: "ok", value: 1 },
        { tag: "ok", value: 2 },
        { tag: "ok", value: 3 },
      ] as R[],
    }),
    invoke: (api, ctx) =>
      (api as ResultApi).sequenceResult((ctx as { items: R[] }).items),
    assert: (r) => {
      const v = r as R;
      return v.tag === "ok" && Array.isArray((v as { value: unknown }).value);
    },
  },
  {
    name: "sequenceResult — first err wins over later errs",
    setup: () => ({
      items: [
        { tag: "ok", value: 1 },
        { tag: "err", error: "first" },
        { tag: "err", error: "second" },
      ] as R[],
    }),
    invoke: (api, ctx) =>
      (api as ResultApi).sequenceResult((ctx as { items: R[] }).items),
    assert: (r) => {
      const v = r as R;
      return v.tag === "err" && (v as { error: unknown }).error === "first";
    },
  },
];
