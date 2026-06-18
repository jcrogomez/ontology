// Isolated behaviour-check CHILD entry.
//
// Spawned by behavior-checker-isolated.runBehaviorCheckIsolated. The behaviour
// checker imports and RUNS an LLM-generated draft in-process with no sandbox
// (BEHAVIOUR_AXIS_CHECKER_SPEC §3.2). A draft can schedule a DEFERRED throw — an
// orphaned timer, a late microtask, a thrown process hook — that fires AFTER the
// per-case guards return and surfaces as an uncaughtException that kills the host
// (exactly what an IO node like lock.ts triggers). The in-process guard cannot
// catch a throw that fires after it tears down. Running the check in this child
// and then exiting hard means any deferred work dies WITH the process — it can
// only ever take down this disposable child, never the parent run.
//
// Protocol: argv[2] = input JSON path, argv[3] = output JSON path. We read the
// payload, run the check, write the BehaviorCheckResult to the output path, then
// process.exit immediately. The parent reads the output file; a child that
// crashes WITHOUT writing it is surfaced by the parent as `untested`.

import * as fs from "node:fs";
import { loadFixtureFromPath, runBehaviorCheck } from "./behavior-checker.js";

interface ChildInput {
  nodeId: string;
  sourcePath: string;
  regenPath: string;
  fixturePath: string;
  perCaseTimeoutMs?: number;
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as ChildInput;

  let result;
  try {
    const fixture = await loadFixtureFromPath(input.fixturePath);
    result = await runBehaviorCheck({
      nodeId: input.nodeId,
      sourcePath: input.sourcePath,
      regenPath: input.regenPath,
      fixture,
      perCaseTimeoutMs: input.perCaseTimeoutMs,
    });
  } catch (err) {
    // Harness-level failure (fixture load, etc.) — report untested, never crash.
    result = {
      nodeId: input.nodeId,
      verdict: "untested" as const,
      reason: `isolated_harness_error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: 0,
    };
  }

  fs.writeFileSync(outputPath, JSON.stringify(result));
  // Hard exit: do not run the event loop to drain — a draft's orphaned timer
  // must not get a tick to throw. We already persisted the verdict.
  process.exit(0);
}

main().catch(() => process.exit(2));
