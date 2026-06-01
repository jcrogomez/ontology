// onto ingest --intent — wiring integration (mock provider, deterministic).
//
// The mock provider's semantic_parse path returns the first JSON object
// embedded in the prompt (identity functor for ingest), so we fixture-drive
// the whole intent-narration flow without a real LLM: routing → file read →
// neighbourhood prompt → dispatch → IntentNarration schema validation →
// re-anchored sourceFiles → JSON output. The proposal-creation path reuses the
// already-tested createProposal primitive; here we pin the dry-run plumbing and
// the mutual-exclusion guards.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ingestCommand, type IngestCommandOptions } from "../src/commands/ingest/index.js";

describe("onto ingest --intent (mock, dry-run)", () => {
  let tmpDir: string;
  let logs: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-intent-"));
    logs = [];
    vi.spyOn(console, "log").mockImplementation((m?: unknown) => {
      logs.push(String(m));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    // failWith calls process.exit(1); make it throw so failures are catchable
    // rather than killing the test runner.
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const narration = {
    label: "Cooperative multi-process guard",
    level: "unit",
    problem: "Two processes can interleave conflicting writes to shared state.",
    decision: "File-based advisory lock, not OS flock — portable and shell-inspectable.",
    constraints: ["Deadlock-free", "Never break a cross-host lock"],
    parentGoal: "Make the kernel safe under concurrency, not just crashes.",
    intentPrompt: "Build a cooperative guard so two processes can't interleave writes.",
    acceptanceCriteria: ["Exactly one of two concurrent acquirers succeeds."],
    sourceFiles: ["the-model-guessed-this.ts"],
  };

  it("narrates a single file (mock identity) and round-trips the IntentNarration", async () => {
    const fixture = path.join(tmpDir, "fixture.ts");
    fs.writeFileSync(fixture, `// embedded JSON for the mock identity extractor\n${JSON.stringify(narration)}\n`);

    const opts: IngestCommandOptions = { intent: true, provider: "mock", dryRun: true, json: true };
    await ingestCommand([fixture], opts);

    const out = JSON.parse(logs.join("\n"));
    expect(out.ok).toBe(true);
    expect(out.dryRun).toBe(true);
    expect(out.provider).toBe("mock");
    expect(out.narration.label).toBe(narration.label);
    expect(out.narration.intentPrompt).toBe(narration.intentPrompt);
    expect(out.narration.acceptanceCriteria).toEqual(narration.acceptanceCriteria);
    // sourceFiles is re-anchored to the file actually fed — NOT the model's guess.
    expect(out.narration.sourceFiles).toEqual([expect.stringContaining("fixture.ts")]);
    expect(out.narration.sourceFiles).not.toContain("the-model-guessed-this.ts");
  });

  it("rejects --intent combined with --from-pr (mutually exclusive sources)", async () => {
    const opts: IngestCommandOptions = { intent: true, fromPr: "1", json: true };
    await expect(ingestCommand([], opts)).rejects.toThrow(/process\.exit/);
    const out = JSON.parse(logs.join("\n"));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/positional file paths/);
  });

  it("rejects --intent with no file paths", async () => {
    const opts: IngestCommandOptions = { intent: true, json: true };
    await expect(ingestCommand([], opts)).rejects.toThrow(/process\.exit/);
    const out = JSON.parse(logs.join("\n"));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/needs at least one file/);
  });
});
