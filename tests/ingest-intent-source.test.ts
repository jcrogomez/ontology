import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  ingestFromIntentSource,
  matchChangedFilesToNodes,
} from "../src/surfaces/commands/ingest/index.js";
import { loadState, loadNodeById } from "../src/kernel/core/project/load.js";
import type { IntentSource } from "../src/inverse/ingest/github.js";
import type { LlmProvider } from "../src/runtime/llm/types.js";

const CLI_PATH = path.resolve(__dirname, "../dist/cli.js");
const MOCK = "mock" as LlmProvider;

function run(dir: string, args: string[]) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd: dir, encoding: "utf8" });
}

// A valid ExtractionResult JSON the mock provider will echo back verbatim
// (its semantic_parse identity path returns the first balanced JSON object
// embedded in the prompt — see src/runtime/llm/mock.ts).
function embeddedExtraction(extra: Record<string, unknown>): string {
  return JSON.stringify(extra);
}

describe("ingest from intent source (PR / issue)", () => {
  let dir: string;

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error("dist/cli.js not found — run `npm run build` before this test.");
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-ingest-src-"));
    run(dir, ["init"]);

    // Seed one code node whose outputs.files[0] === "src/foo.ts", by
    // ingesting a real file (mock) and applying the proposal. create-node.ts
    // maps the proposal's sourceFiles → outputs.files.
    fs.mkdirSync(path.join(dir, "src"));
    const fooJson = embeddedExtraction({
      label: "foo",
      level: "unit",
      kind: "function",
      manifestation: "code",
      language: "typescript",
      prompt: "export function foo(): void {}",
      provides: ["foo"],
    });
    fs.writeFileSync(path.join(dir, "src", "foo.ts"), `// ${fooJson}\nexport function foo(): void {}\n`);
    const ing = run(dir, ["ingest", "src/foo.ts", "--provider", "mock", "--json"]);
    const proposalId = JSON.parse(ing.stdout).proposal.id as string;
    run(dir, ["proposal", "apply", proposalId]);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function parent() {
    const state = loadState(dir);
    const node = loadNodeById(state.rootNodeId, dir);
    if (!node) throw new Error("canon parent not found");
    return { parentNodeId: node.id, parentHash: node.integrity.hash };
  }

  it("captures a PR as an intent node (manifestation=intent) + best-effort file matches", async () => {
    const extraction = {
      label: "Rate-limit the public API",
      level: "target",
      kind: "decision",
      manifestation: "intent",
      prompt: "Add a token-bucket limiter to the public API to prevent abuse.",
      rules: ["return 429 when the bucket is empty", "limit must be configurable"],
    };
    const source: IntentSource = {
      kind: "pr",
      number: 42,
      title: "Rate limit",
      body: `We keep getting hammered. ${embeddedExtraction(extraction)}`,
      url: "https://example.test/pr/42",
      files: [{ path: "src/foo.ts" }, { path: "src/missing.ts" }],
    };
    const { parentNodeId, parentHash } = parent();
    const res = await ingestFromIntentSource({
      source,
      provider: MOCK,
      parentNodeId,
      parentHash,
      dryRun: false,
      json: true,
      cwd: dir,
    });

    expect(res.ok).toBe(true);
    expect(res.proposalId).toBeTruthy();
    expect(res.extracted?.manifestation).toBe("intent");
    expect(res.extracted?.label).toBe("Rate-limit the public API");
    // Best-effort: the existing node matches, the missing file does not.
    const matchedFiles = (res.matchedFiles ?? []).map((m) => m.file);
    expect(matchedFiles).toContain("src/foo.ts");
    expect(matchedFiles).not.toContain("src/missing.ts");
  });

  it("matchChangedFilesToNodes resolves existing code nodes only (1 resolved, 1 skipped)", () => {
    const matches = matchChangedFilesToNodes(
      [{ path: "src/foo.ts" }, { path: "src/missing.ts" }],
      dir,
    );
    expect(matches.length).toBe(1);
    expect(matches[0].file).toBe("src/foo.ts");
    expect(matches[0].nodeId).toMatch(/^node_/);
  });

  it("an issue with no embedded files yields no file matches", async () => {
    const extraction = {
      label: "Document the onboarding flow",
      level: "workflow",
      kind: "definition",
      manifestation: "intent",
      prompt: "Write a getting-started guide covering init through compile.",
    };
    const source: IntentSource = {
      kind: "issue",
      number: 7,
      title: "Docs gap",
      body: embeddedExtraction(extraction),
      url: "https://example.test/issue/7",
    };
    const { parentNodeId, parentHash } = parent();
    const res = await ingestFromIntentSource({
      source,
      provider: MOCK,
      parentNodeId,
      parentHash,
      dryRun: false,
      json: true,
      cwd: dir,
    });
    expect(res.ok).toBe(true);
    expect(res.matchedFiles?.length ?? 0).toBe(0);
  });

  it("dry-run does not write a proposal", async () => {
    const proposalsDir = path.join(dir, ".ontology", "proposals");
    const before = fs.existsSync(proposalsDir) ? fs.readdirSync(proposalsDir).length : 0;
    const extraction = {
      label: "X",
      level: "target",
      kind: "decision",
      manifestation: "intent",
      prompt: "do x",
    };
    const source: IntentSource = {
      kind: "issue",
      number: 99,
      title: "x",
      body: embeddedExtraction(extraction),
      url: "",
    };
    const { parentNodeId, parentHash } = parent();
    const res = await ingestFromIntentSource({
      source,
      provider: MOCK,
      parentNodeId,
      parentHash,
      dryRun: true,
      json: true,
      cwd: dir,
    });
    expect(res.ok).toBe(true);
    const after = fs.existsSync(proposalsDir) ? fs.readdirSync(proposalsDir).length : 0;
    expect(after).toBe(before);
  });

  // ── CLI surface guards ───────────────────────────────────────────────────

  it("errors when neither paths nor a source flag is given", () => {
    const r = run(dir, ["ingest"]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/No paths provided|--from-pr/);
  });

  it("errors when --resolve-edges is used without --from-pr", () => {
    const r = run(dir, ["ingest", "--from-issue", "1", "--resolve-edges", "node_0000_canon"]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/--resolve-edges requires --from-pr/);
  });

  it("errors when both paths and a source flag are given", () => {
    const r = run(dir, ["ingest", "src/foo.ts", "--from-pr", "1"]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/not both/);
  });
});
