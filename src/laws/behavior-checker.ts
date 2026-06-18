import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { BehaviorState } from "./matrix.js";

// Behaviour-axis checker — Phase ε prework, v0 implementation.
//
// See docs/design/inverse/BEHAVIOUR_AXIS_CHECKER_SPEC.md for the design. This
// module owns the *measurement*: given a source artefact, its compile-
// back regen, and a fixture of pre-registered call-sites, decide
// whether the two artefacts compute the same function on the same
// input. The result folds into the matrix's `behavior` axis state.
//
// The checker is intentionally orthogonal to the structural Jaccard
// from verify-homeomorphism: AST grounding biases the declaration set
// (a structural metric), but it does not bias what the function *does*
// at a given input. That orthogonality is what makes the column
// worth opening — see spec §2.
//
// Loading model: dynamic `import(<file-url>)`. The Ontology CLI is run
// under `tsx` (`tsx src/cli.ts`) and the vitest harness has its own TS
// loader, so the host process already knows how to materialise a `.ts`
// module from disk. We append a unique query string per import so the
// loader does not return a cached module — each invocation is fresh
// enough for v0; full process isolation is a v1 concern.
//
// Wall-clock cap: each case is raced against a `setTimeout` so a hung
// fixture cannot stall the whole verify sweep. Memory caps are NOT
// enforced in v0 (Node has no in-process memory cap without
// `vm.Module`); per spec §3.2, full sandboxing is out of v0 scope.

// ── Public types ────────────────────────────────────────────────────────────

/**
 * A single call-site exercising one entry point of the node's
 * artefact. The fixture invokes the case against both the source
 * module and the regen module and compares the results.
 *
 * Parametrised loosely on TApi (the module shape) and TCtx (the
 * setup-returned per-case context). Fixtures may pin these to the
 * specific module type or leave them as `unknown`.
 */
export interface BehaviorCase<TApi = unknown, TCtx = unknown> {
  /** Short label for the case, surfaced in the failure message. */
  name: string;
  /**
   * Optional human-readable acceptance criterion: the CONTRACT this case
   * pins, in prose, at the level of observable behaviour (not
   * implementation). Purely documentary for the checker — it never reads
   * this field when deciding a verdict. Its purpose is the inverse
   * direction: `oracle-grounding.ts` surfaces `name` + `description` into
   * the compile-back system prompt so the regenerator SEES the behavioural
   * spec it will be judged against (the "oracle-into-generation" lever,
   * REGEN_INTENT_CONSUMPTION_2026-06-17 §"WHAT TO BUILD" #1). Keep it
   * contract-level — e.g. "acquiring on a fresh repo returns a handle whose
   * body records THIS process's pid/hostname" — never "use fs.openSync with
   * the wx flag", which would leak implementation into the prompt.
   */
  description?: string;
  /**
   * Build a fresh per-case context. Called twice — once per side — so
   * a case that creates a temp file does not leak side-effects between
   * the source-side invocation and the regen-side invocation.
   */
  setup: () => TCtx;
  /**
   * Invoke the entry point under test. `api` is the dynamically
   * imported module's namespace object; cast to the fixture's expected
   * shape. May return a value or a promise.
   */
  invoke: (api: TApi, ctx: TCtx) => unknown | Promise<unknown>;
  /**
   * Assertion on the returned value + the context (which may now carry
   * side-effects from `invoke`). Return true when the case is well-
   * formed under either side; return false to short-circuit the case
   * as a failure even before the src/regen comparison runs.
   *
   * Note: the comparator the checker uses is `assert` AND structural
   * deep-equal of the returned value across the two sides. So a fixture
   * that only cares about side-effects (e.g. file existence) and not
   * the return value can return `undefined` from `invoke` consistently;
   * deep-equal will agree, and `assert` carries the side-effect check.
   */
  assert: (result: unknown, ctx: TCtx) => boolean;
}

/**
 * The exported shape of a fixture file at
 * `tests/behavior-fixtures/<nodeId>.fixture.ts`. Loaded by name; the
 * file must default- or named-export `cases`.
 */
export interface BehaviorFixture {
  cases: BehaviorCase[];
}

/**
 * v0 verdict for one node. Matches the BehaviorState vocabulary in
 * matrix.ts:
 *   - pass: both modules loaded, all cases passed and agreed
 *   - fail: both modules loaded, ≥ 1 case diverged or its assert
 *           returned false on one side
 *   - untested: at least one of {fixture-missing, src-load-failed,
 *           regen-load-failed, timeout} — the v0 checker cannot speak
 *           confidently for this node
 */
export type BehaviorVerdict = "pass" | "fail" | "untested";

/**
 * Per-node behaviour-check report. Always carries a verdict; the
 * detail fields populate when the run produced useful evidence. The
 * shape mirrors the existing DistanceMetrics design — pure data, JSON-
 * serialisable, no module references.
 */
export interface BehaviorCheckResult {
  nodeId: string;
  verdict: BehaviorVerdict;
  /**
   * Reason the verdict landed where it did. For `untested`, names the
   * cause (`no_fixture`, `src_load_failed`, `regen_load_failed`,
   * `timeout`). For `fail`, names the case that diverged. Optional on
   * `pass` (no anomaly to describe).
   */
  reason?: string;
  /** Per-case results in order, when at least one case ran. */
  cases?: ReadonlyArray<{
    name: string;
    /**
     * One of: `match` (both sides agreed and asserted true),
     * `divergent` (sides disagreed or one side's assert returned false),
     * `errored` (one side threw and the other did not, or both threw
     * but with different error shapes — counted as divergent unless
     * both threw identically), `timeout` (case wall-clock cap fired).
     */
     outcome: "match" | "divergent" | "errored" | "timeout";
    /** Optional human note (the thrown error message, deep-equal diff). */
    detail?: string;
  }>;
  /** Wall-clock duration of the per-node check, including module load. */
  durationMs: number;
}

// ── Fixture loading ─────────────────────────────────────────────────────────

/**
 * Resolve a fixture file path for `<fixturesDir>/<nodeId>.fixture.{ts,js}`.
 * Tries `.fixture.ts` first (the canonical extension for production
 * fixtures — the project is TypeScript-source), then `.fixture.js`
 * (the test-harness convention: vitest's resolver does not load TS
 * files from outside the project's Vite root, so the unit tests
 * write `.fixture.js` into tmpdirs). Returns the absolute path of the
 * first match, or null if neither exists.
 */
export function resolveFixturePath(
  fixturesDir: string,
  nodeId: string,
): string | null {
  // `.ts` is the canonical production extension (CLI runs under tsx).
  // `.mjs` is the test-harness convention: vitest dispatches dynamic
  // imports through Vite's resolver, which rejects file:// URLs to
  // paths outside the project root (e.g. tmpdirs). Node's native ESM
  // loader handles `.mjs` regardless, so tests use that extension.
  // `.js` covers ad-hoc post-build use where the fixtures live next
  // to compiled output.
  for (const ext of [".fixture.ts", ".fixture.mjs", ".fixture.js"] as const) {
    const candidate = path.resolve(fixturesDir, `${nodeId}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Dynamically import a fixture module and pull its `cases` export.
 * Returns null when the file is missing; throws when the file exists
 * but does not have a valid shape (the caller surfaces that as
 * `untested` with reason="fixture_load_failed").
 */
export async function loadFixture(
  fixturesDir: string,
  nodeId: string,
): Promise<{ path: string; fixture: BehaviorFixture } | null> {
  const fixturePath = resolveFixturePath(fixturesDir, nodeId);
  if (!fixturePath) return null;
  const mod = await importIsolatedRaw(fixturePath);
  if (!mod.ok) {
    throw new Error(`fixture import failed: ${mod.reason}`);
  }
  const cases = (mod.api as { cases?: unknown }).cases;
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("fixture must export a non-empty `cases` array");
  }
  for (const c of cases) {
    if (
      typeof (c as BehaviorCase).name !== "string" ||
      typeof (c as BehaviorCase).setup !== "function" ||
      typeof (c as BehaviorCase).invoke !== "function" ||
      typeof (c as BehaviorCase).assert !== "function"
    ) {
      throw new Error(
        `fixture case has wrong shape (need {name, setup, invoke, assert})`,
      );
    }
  }
  return { path: fixturePath, fixture: { cases: cases as BehaviorCase[] } };
}

// ── Isolated import ─────────────────────────────────────────────────────────

type ImportResult =
  | { ok: true; api: unknown }
  | { ok: false; reason: string };

/**
 * Dynamic import with a cache-busting query so re-imports of the same
 * file get a fresh evaluation. Returns the module namespace object as
 * `api`. Errors are caught and surfaced as `{ok:false}` so the caller
 * can fold them into the `untested` verdict cleanly.
 *
 * Note on TypeScript: when the host process is `tsx src/cli.ts` (the
 * CLI) or vitest (the test harness), Node's loader knows how to read
 * a `.ts` URL. Compiled Node (post `npm run build`) imports the
 * generated `.js` instead — the same path resolution still works
 * because the fixtures and regens are TS at design time and the
 * checker is dispatched from the CLI process.
 */
async function importIsolatedRaw(absolutePath: string): Promise<ImportResult> {
  try {
    const url = pathToFileURL(absolutePath).href;
    // Cache bust so repeated imports during a single verify sweep
    // (multi-rep aggregation, smoke loops) get fresh module state.
    const cacheBust = `?ts=${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const mod = (await import(/* @vite-ignore */ url + cacheBust)) as unknown;
    return { ok: true, api: mod };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Public wrapper: race the dynamic import against a wall-clock timeout
 * so a module whose top-level side-effects hang cannot stall the
 * sweep. Default timeout matches the per-case default (5s) — module
 * load is typically much faster, but a top-level `await fetch(...)` in
 * a misbehaving regen could legitimately need the cap.
 */
export async function importIsolated(
  absolutePath: string,
  options: { timeoutMs?: number } = {},
): Promise<ImportResult> {
  const timeoutMs = clamp(options.timeoutMs ?? 5000, 100, 60000);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<ImportResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, reason: `module load timeout ${timeoutMs}ms` }),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([importIsolatedRaw(absolutePath), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Per-case execution ──────────────────────────────────────────────────────

/**
 * Race a callback against a timeout. Returns `{ok:true,value}` on
 * resolution, `{ok:false,reason:'timeout'}` on cap fire, or
 * `{ok:false,reason:<err>}` on throw. v0 has no memory cap; spec §3.2.
 */
async function withTimeout<T>(
  fn: () => unknown | Promise<unknown>,
  timeoutMs: number,
): Promise<
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" | "throw"; message: string }
> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ ok: false; reason: "timeout"; message: string }>(
    (resolve) => {
      timer = setTimeout(
        () => resolve({ ok: false, reason: "timeout", message: `case timed out after ${timeoutMs}ms` }),
        timeoutMs,
      );
    },
  );
  try {
    const work = (async () => {
      try {
        const value = (await fn()) as T;
        return { ok: true as const, value };
      } catch (err) {
        return {
          ok: false as const,
          reason: "throw" as const,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    })();
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Equality model ──────────────────────────────────────────────────────────

/**
 * Structural deep-equal, intentionally permissive about ordering of
 * object keys but strict about types and array order. Walks plain
 * objects, arrays, Maps, Sets, and primitives. NaN equals NaN
 * (consistent with `Object.is`). Two functions are equal only if they
 * are the same reference — fixtures should not return functions.
 *
 * Inlined (rather than imported from a util) so the checker stays
 * self-contained — it sits below the matrix in the import graph and
 * has no other deps within legend/.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;

  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k)) return false;
      if (!deepEqual(v, b.get(k))) return false;
    }
    return true;
  }
  if (b instanceof Map) return false;

  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) return false;
    // Sets are unordered — fall through to a contains-check.
    for (const v of a) {
      if (!b.has(v)) return false;
    }
    return true;
  }
  if (b instanceof Set) return false;

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao).sort();
  const bKeys = Object.keys(bo).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  for (const k of aKeys) {
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

// ── Per-node runner ─────────────────────────────────────────────────────────

export interface RunBehaviorCheckOptions {
  nodeId: string;
  sourcePath: string;
  regenPath: string;
  fixture: BehaviorFixture;
  /** Per-case wall-clock cap. Default 5s. Clamped to [100ms, 60s]. */
  perCaseTimeoutMs?: number;
}

/**
 * Run the behaviour check for one node. Loads src and regen modules,
 * iterates the fixture's cases, races each side against the timeout,
 * compares via `assert` + structural deep-equal, and folds into a
 * single verdict.
 */
export async function runBehaviorCheck(
  options: RunBehaviorCheckOptions,
): Promise<BehaviorCheckResult> {
  const t0 = Date.now();
  const perCaseTimeoutMs = clamp(options.perCaseTimeoutMs ?? 5000, 100, 60000);

  const srcMod = await importIsolated(options.sourcePath, {
    timeoutMs: perCaseTimeoutMs,
  });
  if (!srcMod.ok) {
    return {
      nodeId: options.nodeId,
      verdict: "untested",
      reason: `src_load_failed: ${srcMod.reason}`,
      durationMs: Date.now() - t0,
    };
  }
  const regenMod = await importIsolated(options.regenPath, {
    timeoutMs: perCaseTimeoutMs,
  });
  if (!regenMod.ok) {
    return {
      nodeId: options.nodeId,
      verdict: "untested",
      reason: `regen_load_failed: ${regenMod.reason}`,
      durationMs: Date.now() - t0,
    };
  }

  const cases: Array<{
    name: string;
    outcome: "match" | "divergent" | "errored" | "timeout";
    detail?: string;
  }> = [];
  let allPass = true;
  let firstFailReason: string | undefined;

  for (const c of options.fixture.cases) {
    let ctxA: unknown;
    let ctxB: unknown;
    try {
      ctxA = c.setup();
      ctxB = c.setup();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      cases.push({ name: c.name, outcome: "errored", detail: `setup threw: ${detail}` });
      allPass = false;
      firstFailReason ??= `case "${c.name}" setup threw: ${detail}`;
      continue;
    }

    const ra = await withTimeout<unknown>(
      () => c.invoke(srcMod.api, ctxA),
      perCaseTimeoutMs,
    );
    const rb = await withTimeout<unknown>(
      () => c.invoke(regenMod.api, ctxB),
      perCaseTimeoutMs,
    );

    if (!ra.ok && ra.reason === "timeout") {
      cases.push({ name: c.name, outcome: "timeout", detail: `src side: ${ra.message}` });
      allPass = false;
      firstFailReason ??= `case "${c.name}" src side timed out`;
      continue;
    }
    if (!rb.ok && rb.reason === "timeout") {
      cases.push({ name: c.name, outcome: "timeout", detail: `regen side: ${rb.message}` });
      allPass = false;
      firstFailReason ??= `case "${c.name}" regen side timed out`;
      continue;
    }

    // Both sides threw → match only if they threw identically (by
    // message); throwing is part of "what the function does". One side
    // throwing while the other returns is a behavioural divergence.
    if (!ra.ok && !rb.ok) {
      if (ra.message === rb.message) {
        cases.push({ name: c.name, outcome: "match", detail: `both threw: ${ra.message}` });
      } else {
        cases.push({
          name: c.name,
          outcome: "errored",
          detail: `src threw "${ra.message}", regen threw "${rb.message}"`,
        });
        allPass = false;
        firstFailReason ??= `case "${c.name}": both sides threw with different messages`;
      }
      continue;
    }
    if (!ra.ok) {
      cases.push({
        name: c.name,
        outcome: "errored",
        detail: `src threw: ${ra.message}`,
      });
      allPass = false;
      firstFailReason ??= `case "${c.name}": src threw, regen did not`;
      continue;
    }
    if (!rb.ok) {
      cases.push({
        name: c.name,
        outcome: "errored",
        detail: `regen threw: ${rb.message}`,
      });
      allPass = false;
      firstFailReason ??= `case "${c.name}": regen threw, src did not`;
      continue;
    }

    let assertA = false;
    let assertB = false;
    try {
      assertA = c.assert(ra.value, ctxA);
      assertB = c.assert(rb.value, ctxB);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      cases.push({ name: c.name, outcome: "errored", detail: `assert threw: ${detail}` });
      allPass = false;
      firstFailReason ??= `case "${c.name}" assert threw: ${detail}`;
      continue;
    }

    if (!assertA || !assertB) {
      cases.push({
        name: c.name,
        outcome: "divergent",
        detail: `assert returned ${assertA ? "true" : "false"} on src, ${assertB ? "true" : "false"} on regen`,
      });
      allPass = false;
      firstFailReason ??= `case "${c.name}": assert failed on ${assertA ? "regen" : "src"}`;
      continue;
    }

    if (!deepEqual(ra.value, rb.value)) {
      cases.push({
        name: c.name,
        outcome: "divergent",
        detail: "src and regen returned non-deep-equal values",
      });
      allPass = false;
      firstFailReason ??= `case "${c.name}": values diverged`;
      continue;
    }

    cases.push({ name: c.name, outcome: "match" });
  }

  return {
    nodeId: options.nodeId,
    verdict: allPass ? "pass" : "fail",
    ...(allPass ? {} : { reason: firstFailReason ?? "behaviour divergence" }),
    cases,
    durationMs: Date.now() - t0,
  };
}

// ── Folder to matrix axis state ─────────────────────────────────────────────

/**
 * Translate a v0 BehaviorVerdict into the canonical BehaviorState used
 * by the matrix. v0 emits {pass, fail, untested} only — the
 * `not-applicable` state stays reserved for the unrecoverable verdict
 * path (no regen artefact exists), which is set by `verdictToMatrixCell`
 * before this checker ever runs.
 */
export function behaviorVerdictToMatrixState(
  verdict: BehaviorVerdict,
): BehaviorState {
  // The mapping is the identity for the three states v0 emits, but
  // keep it explicit so the matrix's `not-applicable` cannot leak out
  // of the checker.
  switch (verdict) {
    case "pass":
      return "pass";
    case "fail":
      return "fail";
    case "untested":
      return "untested";
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
