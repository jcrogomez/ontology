// Process-isolated behaviour check — the principled fix the v0 in-process
// checker flagged as a follow-up (BEHAVIOUR_AXIS_CHECKER_SPEC §3.2,
// regenerate.ts withRegenDraftGuard). Spawns behavior-check-child under tsx,
// hands it the source/regen/fixture paths, and reads back the verdict from a
// result file. A draft that schedules a deferred throw, spins forever, or calls
// process.exit can only ever take down the disposable child, bounded by TWO
// independent runaway caps: the parent's spawnSync `timeout` (wall-clock) AND a
// kernel-enforced `ulimit -t` CPU cap that survives an orphaned parent (see the
// spawn site). The parent always gets a verdict.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { BehaviorCheckResult } from "./behavior-checker.js";

export interface IsolatedCheckOptions {
  nodeId: string;
  sourcePath: string;
  regenPath: string;
  /** Absolute path to the fixture module (the child re-loads it — functions
   *  cannot cross the process boundary). */
  fixturePath: string;
  /** Per-case wall-clock cap inside the child. Default 5s. */
  perCaseTimeoutMs?: number;
  /** Overall wall-clock cap for the whole child, including spawn + module load.
   *  Default 60s. Backstop for a child that hangs before writing a result. */
  hardTimeoutMs?: number;
  /** Project root (for resolving the tsx runtime). Default process.cwd(). */
  cwd?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Run the same node that hosts us, loading the installed tsx runtime so the
// child can import the `.ts` source/regen/fixture exactly like the CLI does.
function resolveTsxCli(cwd: string): string {
  const candidates = [
    path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(__dirname, "..", "..", "node_modules", "tsx", "dist", "cli.mjs"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Last resort: the .bin shim (node can still execute the .mjs it points to).
  return path.join(cwd, "node_modules", ".bin", "tsx");
}

function untested(nodeId: string, reason: string, durationMs: number): BehaviorCheckResult {
  return { nodeId, verdict: "untested", reason, durationMs };
}

export function runBehaviorCheckIsolated(options: IsolatedCheckOptions): BehaviorCheckResult {
  const cwd = options.cwd ?? process.cwd();
  const perCaseTimeoutMs = options.perCaseTimeoutMs ?? 5000;
  const hardTimeoutMs = options.hardTimeoutMs ?? 60000;
  const t0 = Date.now();

  const childScript = path.join(__dirname, "behavior-check-child.ts");
  const tsxCli = resolveTsxCli(cwd);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-bcheck-"));
  const inputPath = path.join(tmpDir, "in.json");
  const outputPath = path.join(tmpDir, "out.json");

  try {
    fs.writeFileSync(
      inputPath,
      JSON.stringify({
        nodeId: options.nodeId,
        sourcePath: options.sourcePath,
        regenPath: options.regenPath,
        fixturePath: options.fixturePath,
        perCaseTimeoutMs,
      }),
    );

    // Two independent runaway caps, because a draft's synchronous infinite loop
    // (`while(true){}`) blocks the child's event loop — no in-process watchdog
    // can ever fire, so the killer MUST be external:
    //   1. spawnSync `timeout` (wall-clock) — enforced by THIS parent. Fast, but
    //      it dies if the parent dies (e.g. the OOM killer takes a vitest worker
    //      mid-check on a memory-constrained box), orphaning the child.
    //   2. `ulimit -t` (RLIMIT_CPU) — enforced by the KERNEL. Survives an
    //      orphaned parent: the kernel sends SIGXCPU→SIGKILL after N CPU-seconds
    //      whatever happened to us. This is the net that stops a runaway from
    //      pegging a core for hours after its parent is gone.
    // `exec "$@"` makes the shell REPLACE itself with node (same PID, inherited
    // rlimit), so there is no extra process and the wall-clock timeout still
    // targets the node child directly.
    const args = [tsxCli, childScript, inputPath, outputPath];
    const cpuCapSeconds = Math.ceil(hardTimeoutMs / 1000) + 5;
    const r =
      process.platform === "win32"
        ? spawnSync(process.execPath, args, {
            cwd,
            timeout: hardTimeoutMs,
            killSignal: "SIGKILL",
            stdio: ["ignore", "ignore", "pipe"],
            encoding: "utf-8",
          })
        : spawnSync(
            "/bin/sh",
            ["-c", `ulimit -t ${cpuCapSeconds}; exec "$@"`, "sh", process.execPath, ...args],
            {
              cwd,
              timeout: hardTimeoutMs,
              killSignal: "SIGKILL",
              stdio: ["ignore", "ignore", "pipe"],
              encoding: "utf-8",
            },
          );

    // The verdict file is the source of truth. The child writes it BEFORE its
    // hard exit, so even if the child then dies on an orphaned throw (non-zero
    // status / signal), we still trust the persisted result.
    if (fs.existsSync(outputPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as BehaviorCheckResult;
        return result;
      } catch {
        // fall through to the no-result path
      }
    }

    // No result file → the child died before writing one. Surface it as
    // untested (the checker could not speak), with the precise cause. The
    // executor treats untested-with-fixture as a refinable/escalatable draft,
    // so a draft that crashes the checker is never written.
    if (r.signal) {
      return untested(
        options.nodeId,
        `isolated_check_killed: ${r.signal}${r.signal === "SIGKILL" ? ` (hard timeout ${hardTimeoutMs}ms or runaway)` : ""}`,
        Date.now() - t0,
      );
    }
    const stderr = (r.stderr ?? "").toString().trim().split("\n").slice(-3).join(" | ");
    return untested(
      options.nodeId,
      `isolated_check_crashed: exit ${r.status}${stderr ? ` — ${stderr}` : ""}`,
      Date.now() - t0,
    );
  } catch (err) {
    return untested(
      options.nodeId,
      `isolated_spawn_failed: ${err instanceof Error ? err.message : String(err)}`,
      Date.now() - t0,
    );
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}
