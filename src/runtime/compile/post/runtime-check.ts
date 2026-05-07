import { spawnSync } from "node:child_process";

// Optional post-compile runtime check.
//
// `validateLanguage` (PR #104) catches artifacts that don't *parse* as the
// declared language. A model can still emit code that parses but fails at
// runtime — undefined variables, missing imports, references to entities
// that exist only in the prompt's prose. Experiment B iter 3 caught
// exactly this case: a class definition referenced `OntologyGraph()` that
// was never defined; parse-check passed; `python3 file.py` exited with
// NameError.
//
// This validator runs the artifact and reports `failed` when it exits
// non-zero or times out. It is **opt-in** because executing arbitrary
// LLM-generated code is a non-trivial operational decision: an artifact
// could read files, open sockets, or loop forever. Callers must explicitly
// pass `enabled: true` (the CLI exposes this as `--runtime-check`).
//
// Sandboxing is intentionally minimal: the check spawns a subprocess
// with a wall-clock timeout. There is no syscall filtering, no fs root,
// no network isolation. On a developer machine that is acceptable;
// running on shared infrastructure should compose with an external
// sandbox (firejail, docker, etc.) at the call site.
//
// Languages: python first. Other languages return `skipped` rather than
// silently passing — surfacing "we cannot check this" beats false
// positives.

export interface RuntimeCheckOptions {
  // Absolute path to the artifact written by writeArtifact.
  absolutePath: string;
  // The node's declared language (node.technical.language). Compared
  // case-insensitively.
  language?: string;
  // Subprocess wall-clock timeout. Default 5s. Extreme upper bound: 60s.
  timeoutMs?: number;
}

export type RuntimeCheckResult =
  | { status: "ok"; stdout: string; durationMs: number }
  | { status: "failed"; message: string; stdout?: string; stderr?: string; exitCode: number | null }
  | { status: "skipped"; reason: string };

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 60000;

export function runtimeCheck(options: RuntimeCheckOptions): RuntimeCheckResult {
  const lang = options.language?.toLowerCase().trim();
  if (!lang) {
    return { status: "skipped", reason: "no language declared" };
  }
  const runner = RUNNERS[lang];
  if (!runner) {
    return { status: "skipped", reason: `no runtime runner registered for language=${lang}` };
  }
  const timeout = clamp(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 100, MAX_TIMEOUT_MS);
  return runner(options.absolutePath, timeout);
}

type Runner = (absolutePath: string, timeoutMs: number) => RuntimeCheckResult;

const RUNNERS: Record<string, Runner> = {
  python: (p, timeoutMs) => execWithTimeout({
    bin: "python3",
    args: [p],
    timeoutMs,
    notFoundMessage: "python3 not on PATH",
  }),
};

interface ExecSpec {
  bin: string;
  args: string[];
  timeoutMs: number;
  notFoundMessage: string;
}

function execWithTimeout(spec: ExecSpec): RuntimeCheckResult {
  const t0 = Date.now();
  const r = spawnSync(spec.bin, spec.args, {
    encoding: "utf-8",
    timeout: spec.timeoutMs,
    // Empty stdin so reads of stdin block until timeout rather than hang.
    input: "",
    // Defensive cap on captured output so a runaway print loop does not
    // balloon memory before the timeout fires.
    maxBuffer: 1024 * 1024,
  });
  const durationMs = Date.now() - t0;

  if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") {
    return { status: "skipped", reason: spec.notFoundMessage };
  }
  // spawnSync sets r.signal to "SIGTERM" when timeout fires; r.status is null.
  if (r.signal === "SIGTERM" && durationMs >= spec.timeoutMs - 100) {
    return {
      status: "failed",
      message: `runtime exceeded ${spec.timeoutMs}ms timeout`,
      stdout: r.stdout || undefined,
      stderr: r.stderr || undefined,
      exitCode: null,
    };
  }
  if (r.error) {
    return {
      status: "failed",
      message: r.error.message,
      stdout: r.stdout || undefined,
      stderr: r.stderr || undefined,
      exitCode: r.status,
    };
  }
  if (r.status === 0) {
    return { status: "ok", stdout: r.stdout || "", durationMs };
  }
  const stderrTrimmed = (r.stderr || "").trim();
  return {
    status: "failed",
    message: stderrTrimmed.split("\n").pop() || `exit code ${r.status}`,
    stdout: r.stdout || undefined,
    stderr: stderrTrimmed || undefined,
    exitCode: r.status,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
