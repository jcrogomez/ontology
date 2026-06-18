import { describe, it, expect } from "vitest";
import { lintDraft } from "../src/forward/compile/draft-lint.js";

// Tests for the static self-containment + signature-shape lint
// (REGEN_ORACLE_REFINE_2026-06-17 §"Proposed next levers" #1). The two checks
// target the two recurring glue-regen defects read from the lock.ts drafts:
// an undefined-helper call and an async-where-the-signature-is-sync export.

describe("lintDraft — undefined references", () => {
  it("flags a bare call to a helper that is never declared or imported", () => {
    const src = `
      export function acquireLock() {
        registerExitHook(() => {});
        return makeLock();
      }
      function makeLock() { return {}; }
    `;
    const issues = lintDraft(src);
    const undef = issues.filter((i) => i.kind === "undefined_reference");
    expect(undef.map((i) => i.symbol)).toEqual(["registerExitHook"]);
    expect(undef[0].message).toMatch(/never declares or imports/);
    expect(undef[0].message).toMatch(/ReferenceError/);
  });

  it("does NOT flag declared helpers, imported names, params, or globals", () => {
    const src = `
      import { helper } from "./x.js";
      import * as os from "node:os";
      export function f(cb: () => void) {
        helper();
        os.hostname();          // member call — not a bare identifier
        cb();                   // param
        local();                // declared below
        setTimeout(() => {}, 0); // global
        JSON.stringify({});      // member on global
        new Map();               // global ctor
      }
      function local() {}
    `;
    const undef = lintDraft(src).filter((i) => i.kind === "undefined_reference");
    expect(undef).toEqual([]);
  });

  it("returns [] for unparseable / empty input (best-effort, never throws)", () => {
    expect(lintDraft("")).toEqual([]);
  });
});

describe("lintDraft — async-when-sync", () => {
  const SIGS = {
    acquireLock: "(repoRoot: string, options: AcquireLockOptions = {}): Lock",
    withLock: "<T>(repoRoot: string, fn: () => Promise<T>, options): Promise<T>",
    Lock: "{ lockPath: string; body: LockBody; release(): void; }",
  };

  it("flags an exported function declared async when its signature is synchronous", () => {
    const src = `export async function acquireLock(repoRoot: string): Promise<Lock> { return null as any; }`;
    const issues = lintDraft(src, SIGS).filter((i) => i.kind === "async_when_sync");
    expect(issues.map((i) => i.symbol)).toEqual(["acquireLock"]);
    expect(issues[0].message).toMatch(/must be SYNCHRONOUS/);
  });

  it("flags a const-arrow export that returns a Promise when the signature is sync", () => {
    const src = `export const acquireLock = async (repoRoot: string): Promise<Lock> => null as any;`;
    const issues = lintDraft(src, SIGS).filter((i) => i.kind === "async_when_sync");
    expect(issues.map((i) => i.symbol)).toEqual(["acquireLock"]);
  });

  it("does NOT flag a function whose grounded signature is itself async (Promise return)", () => {
    const src = `export async function withLock(repoRoot: string, fn: any): Promise<any> { return fn(); }`;
    const issues = lintDraft(src, SIGS).filter((i) => i.kind === "async_when_sync");
    expect(issues).toEqual([]);
  });

  it("does NOT flag a correctly synchronous implementation", () => {
    const src = `export function acquireLock(repoRoot: string): Lock { return { lockPath: "", body: {} as any, release() {} }; }`;
    const issues = lintDraft(src, SIGS).filter((i) => i.kind === "async_when_sync");
    expect(issues).toEqual([]);
  });

  it("does not apply the async check to non-function signatures (interfaces)", () => {
    // `Lock` is an interface signature; even a same-named async const should
    // not be policed by the function-only check (Lock isn't a function).
    const src = `export const Lock = async () => 1;`;
    const issues = lintDraft(src, { Lock: SIGS.Lock }).filter((i) => i.kind === "async_when_sync");
    expect(issues).toEqual([]);
  });
});

describe("lintDraft — the lock.ts failure modes together", () => {
  it("catches BOTH the undefined helper and the async-when-sync export in one draft", () => {
    const src = `
      export async function acquireLock(repoRoot: string): Promise<Lock> {
        const l = makeLock(repoRoot, {} as any);
        registerExitHook(() => l.release());
        return l;
      }
      function makeLock(p: string, b: any): Lock {
        return { lockPath: p, body: b, release: () => {} };
      }
    `;
    const issues = lintDraft(src, {
      acquireLock: "(repoRoot: string, options: AcquireLockOptions = {}): Lock",
    });
    const kinds = issues.map((i) => `${i.kind}:${i.symbol}`).sort();
    expect(kinds).toEqual(["async_when_sync:acquireLock", "undefined_reference:registerExitHook"]);
  });
});
