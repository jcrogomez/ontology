import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Coverage for `onto ingest <file>` (Project Legend γ-1 v0+).
//
// We don't hit the real Anthropic API in these tests — that's reserved
// for the γ-2 calibration script. Here we pin the plumbing:
//   - Input validation (missing file, binary file, empty file, bad
//     provider).
//   - The mock provider's identity-functor path produces a parseable
//     extraction when given the right shape, exercising the round-trip
//     dispatcher → JSON parse → Zod validation → proposal-creation.
//   - --dry-run does not write a proposal to disk.

const VALID_EXTRACTION_JSON = JSON.stringify({
  label: "Integrity hashing primitives",
  level: "artifact",
  kind: "artifact",
  manifestation: "code",
  language: "typescript",
  prompt: "Implements content-addressed SHA-256 hashing for the Ontology kernel: hashObject (canonical JSON, no prefix), hashPrompt / hashContext / hashRun (prefixed digests), and removeIntegrityHash (strips integrity.hash before re-hashing).",
  requires: ["createHash", "fast_json_stable_stringify"],
  provides: ["hashObject", "hashPrompt", "hashContext", "hashRun", "removeIntegrityHash"],
  forbids: ["console.log"],
  rules: ["REQUIRE: prefixed digests use '<kind>:hash:<digest>' convention"],
});

describe("onto ingest <file>", () => {
  let tempDir: string;
  let srcFile: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    // Put a fake "source" file at a known path. We'll point ingest at
    // it; the mock provider echoes its prompt back, so a file
    // containing the JSON-shaped extraction is the trivial round-trip
    // fixture.
    srcFile = path.join(tempDir, "src", "fixture.ts");
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("rejects a missing file with a clear error", () => {
    const r = runCli(tempDir, ["ingest", "/tmp/does-not-exist-xyz.ts"]);
    expect(r.status).toBe(1);
    // Pre-γ-5 the error was "Could not read"; γ-5 added a statSync
    // gate up front so the message is now "Could not stat" (we can't
    // tell file-vs-directory without it). Accept either to keep the
    // assertion resilient to either path.
    expect(r.stderr).toMatch(/Could not (read|stat)/);
  });

  it("rejects a binary file (NUL byte guard)", () => {
    const binPath = path.join(tempDir, "binary.bin");
    fs.writeFileSync(binPath, Buffer.from([0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
    const r = runCli(tempDir, ["ingest", binPath, "--provider", "mock"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/binary file|NUL bytes/);
  });

  it("rejects an empty file", () => {
    fs.writeFileSync(srcFile, "");
    const r = runCli(tempDir, ["ingest", srcFile, "--provider", "mock"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/empty/);
  });

  it("rejects an unsupported provider", () => {
    fs.writeFileSync(srcFile, VALID_EXTRACTION_JSON);
    const r = runCli(tempDir, ["ingest", srcFile, "--provider", "openai"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Unsupported provider/);
  });

  it("dry-run prints the extraction and does NOT write a proposal", () => {
    fs.writeFileSync(srcFile, VALID_EXTRACTION_JSON);
    const r = runCli(tempDir, [
      "ingest", srcFile,
      "--provider", "mock",
      "--dry-run",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.extracted.label).toBe("Integrity hashing primitives");
    expect(parsed.extracted.level).toBe("artifact");
    expect(parsed.extracted.kind).toBe("artifact");
    expect(parsed.extracted.requires).toEqual(["createHash", "fast_json_stable_stringify"]);

    // No proposal on disk.
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const proposals = fs.existsSync(proposalsDir)
      ? fs.readdirSync(proposalsDir)
      : [];
    expect(proposals).toEqual([]);
  });

  it("commit path creates a proposal whose payload carries the rich extracted fields directly (γ-3)", () => {
    fs.writeFileSync(srcFile, VALID_EXTRACTION_JSON);
    const r = runCli(tempDir, [
      "ingest", srcFile,
      "--provider", "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.proposal.mutationKind).toBe("node_create");
    expect(parsed.proposal.id).toMatch(/^proposal_/);

    // The proposal lives on disk and carries the rich fields ON THE
    // PAYLOAD (γ-3) — not buried in provenance.rationale anymore. Apply
    // can thread them straight to createNode.
    const proposalPath = path.join(
      tempDir,
      ".ontology/proposals",
      `${parsed.proposal.id}.json`,
    );
    expect(fs.existsSync(proposalPath)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(proposalPath, "utf-8"));
    expect(onDisk.mutation.kind).toBe("node_create");
    const payload = onDisk.mutation.payload;
    expect(payload.level).toBe("artifact");
    expect(payload.kind).toBe("artifact");
    expect(payload.parentNodeId).toBe("node_0000_canon");
    expect(payload.label).toBe("Integrity hashing primitives");
    // Rich fields, now first-class on the payload:
    expect(payload.manifestation).toBe("code");
    expect(payload.language).toBe("typescript");
    expect(payload.requires).toEqual([
      "createHash",
      "fast_json_stable_stringify",
    ]);
    expect(payload.provides).toContain("hashObject");
    expect(payload.forbids).toContain("console.log");
    expect(payload.rules).toEqual([
      "REQUIRE: prefixed digests use '<kind>:hash:<digest>' convention",
    ]);

    // provenance.rationale now carries extractor metadata only (no
    // extractedFields). This is the audit trail showing WHO produced
    // the proposal.
    const rationale = JSON.parse(onDisk.provenance.rationale);
    expect(rationale.extractedFrom).toMatch(/fixture\.ts$/);
    expect(rationale.extractorProvider).toBe("mock");
    expect(rationale.extractedFields).toBeUndefined();
  });

  it("apply produces a node with all the rich fields set in one step (γ-3 round-trip)", () => {
    // The whole point of γ-3: ingest produces a proposal, apply uses
    // the rich payload to create a COMPLETE node — no follow-up
    // `onto node update --requires ... --provides ...` needed.
    fs.writeFileSync(srcFile, VALID_EXTRACTION_JSON);
    const ingestResult = runCli(tempDir, [
      "ingest", srcFile,
      "--provider", "mock",
      "--json",
    ]);
    expect(ingestResult.status).toBe(0);
    const proposalId = JSON.parse(ingestResult.stdout).proposal.id;

    const applyResult = runCli(tempDir, ["proposal", "apply", proposalId, "--json"]);
    expect(applyResult.status).toBe(0);
    const applyParsed = JSON.parse(applyResult.stdout);
    expect(applyParsed.ok).toBe(true);

    // The created node carries every rich field the extractor produced.
    const newNodeId = applyParsed.mutation.createdEntityId;
    expect(newNodeId).toMatch(/^node_/);
    const nodePath = path.join(tempDir, ".ontology/nodes", `${newNodeId}.json`);
    const node = JSON.parse(fs.readFileSync(nodePath, "utf-8"));

    expect(node.label).toBe("Integrity hashing primitives");
    expect(node.coordinates.abstraction).toBe("artifact");
    expect(node.kind).toBe("artifact");
    expect(node.coordinates.manifestation).toBe("code");
    expect(node.technical.language).toBe("typescript");
    // context.requires is the structured-token list. Each entry is
    // {source, nodeType:"declared"}; we map back to bare strings.
    expect(node.context.requires.map((r: any) => r.source)).toEqual([
      "createHash",
      "fast_json_stable_stringify",
    ]);
    expect(node.context.provides.map((p: any) => p.key)).toContain("hashObject");
    expect(node.context.forbids.map((f: any) => f.source)).toContain("console.log");
    expect(node.rules).toEqual([
      "REQUIRE: prefixed digests use '<kind>:hash:<digest>' convention",
    ]);
  });

  it("rejects invalid JSON from the extractor", () => {
    fs.writeFileSync(srcFile, "this is not JSON, just prose about hashing");
    const r = runCli(tempDir, [
      "ingest", srcFile,
      "--provider", "mock",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/did not return valid JSON|failed validation/i);
  });

  it("rejects JSON that fails the schema (missing required fields)", () => {
    // Mock returns the prompt verbatim; an incomplete JSON fails Zod.
    fs.writeFileSync(srcFile, JSON.stringify({ label: "x" }));
    const r = runCli(tempDir, [
      "ingest", srcFile,
      "--provider", "mock",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/failed validation/);
  });

  it("strips a markdown fence around the JSON if the model emits one", () => {
    // Models sometimes wrap JSON in ```json ... ``` despite being
    // told not to. The fence stripper recovers the inner JSON.
    const fenced = "```json\n" + VALID_EXTRACTION_JSON + "\n```";
    fs.writeFileSync(srcFile, fenced);
    const r = runCli(tempDir, [
      "ingest", srcFile,
      "--provider", "mock",
      "--dry-run",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.extracted.label).toBe("Integrity hashing primitives");
  });
});

describe("onto ingest <directory> (γ-5 multi-file)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  // Build a small TS project at `tempDir/src/` whose files (a) carry
  // mock-friendly JSON fixtures so the identity-functor mock provider
  // returns valid extractions, and (b) have a real import edge between
  // them so γ-4's static inference produces a non-empty edge list.
  function setupProject(): void {
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    // a.ts — value import of b's foo. The file's content is a JSON
    // extraction fixture wrapped in a comment so the import edge is
    // recognisable to the TS parser AND the embedded JSON is
    // returnable by the mock's identity functor.
    fs.writeFileSync(
      path.join(srcDir, "a.ts"),
      [
        `import { foo } from "./b.js";`,
        `export function callsB(): void { foo(); }`,
        `/* mock-fixture`,
        JSON.stringify({
          label: "Caller-of-foo",
          level: "unit",
          kind: "rule",
          manifestation: "code",
          language: "typescript",
          prompt: "Invokes foo from neighboring module b.",
          requires: ["foo"],
          provides: ["callsB"],
        }),
        `*/`,
      ].join("\n"),
    );

    // b.ts — type import only of c's TFoo. Embedded fixture too.
    fs.writeFileSync(
      path.join(srcDir, "b.ts"),
      [
        `import type { TFoo } from "./c.js";`,
        `export function foo(): TFoo { return null as unknown as TFoo; }`,
        `/* mock-fixture`,
        JSON.stringify({
          label: "Foo-returning-TFoo",
          level: "unit",
          kind: "rule",
          manifestation: "code",
          language: "typescript",
          prompt: "Returns a TFoo placeholder.",
          requires: ["TFoo"],
          provides: ["foo"],
        }),
        `*/`,
      ].join("\n"),
    );

    // c.ts — leaf type declaration.
    fs.writeFileSync(
      path.join(srcDir, "c.ts"),
      [
        `export interface TFoo { x: number }`,
        `/* mock-fixture`,
        JSON.stringify({
          label: "TFoo-shape",
          level: "token",
          kind: "entity",
          manifestation: "intent",
          prompt: "Public shape used by neighboring modules.",
          provides: ["TFoo"],
        }),
        `*/`,
      ].join("\n"),
    );
  }

  it("walks the directory and produces one proposal per .ts file", () => {
    setupProject();
    const r = runCli(tempDir, [
      "ingest", path.join(tempDir, "src"),
      "--provider", "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.fileCount).toBe(3);
    expect(parsed.okCount).toBe(3);
    expect(parsed.failedCount).toBe(0);

    // One proposal on disk per file.
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const proposals = fs.readdirSync(proposalsDir);
    expect(proposals).toHaveLength(3);

    // Each proposal carries sourceFiles[] with the per-file path so
    // γ-6 can resolve edges back to applied node IDs.
    const proposalsByLabel = new Map<string, any>();
    for (const f of proposals) {
      const p = JSON.parse(fs.readFileSync(path.join(proposalsDir, f), "utf-8"));
      proposalsByLabel.set(p.mutation.payload.label, p);
    }
    expect(Array.from(proposalsByLabel.keys()).sort()).toEqual([
      "Caller-of-foo",
      "Foo-returning-TFoo",
      "TFoo-shape",
    ]);
    for (const p of proposalsByLabel.values()) {
      expect(p.mutation.payload.sourceFiles).toBeDefined();
      expect(p.mutation.payload.sourceFiles).toHaveLength(1);
      expect(p.mutation.payload.sourceFiles[0]).toMatch(/^src\/[abc]\.ts$/);
    }
  });

  it("apply produces a node whose outputs.files carries the source path", () => {
    setupProject();
    // First create the proposals.
    const ingestR = runCli(tempDir, [
      "ingest", path.join(tempDir, "src"),
      "--provider", "mock",
      "--json",
    ]);
    expect(ingestR.status).toBe(0);
    const ingestParsed = JSON.parse(ingestR.stdout);

    // Find the proposal for a.ts and apply it.
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const aProposalFile = fs.readdirSync(proposalsDir).find((f) => {
      const p = JSON.parse(fs.readFileSync(path.join(proposalsDir, f), "utf-8"));
      return p.mutation.payload.sourceFiles?.[0] === "src/a.ts";
    });
    expect(aProposalFile).toBeDefined();
    const proposalId = aProposalFile!.replace(/\.json$/, "");

    const applyR = runCli(tempDir, ["proposal", "apply", proposalId, "--json"]);
    expect(applyR.status).toBe(0);
    const applyParsed = JSON.parse(applyR.stdout);
    expect(applyParsed.ok).toBe(true);
    const nodeId = applyParsed.mutation.createdEntityId;

    const node = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/nodes", `${nodeId}.json`), "utf-8"),
    );
    expect(node.outputs.files).toEqual(["src/a.ts"]);
    void ingestParsed;
  });

  it("reports the inferred cross-file edges from γ-4 (depends_on + uses_token)", () => {
    setupProject();
    const r = runCli(tempDir, [
      "ingest", path.join(tempDir, "src"),
      "--provider", "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    // Three edges total: a→b (depends_on, foo), b→c (uses_token, TFoo).
    // Note: there's only one edge for a→b and one for b→c — no
    // self-loops, no edges from c.
    expect(parsed.edges).toHaveLength(2);
    const byKey = Object.fromEntries(
      parsed.edges.map((e: any) => [`${e.fromFile}→${e.toFile}`, e]),
    );
    expect(byKey["a.ts→b.ts"].type).toBe("depends_on");
    expect(byKey["a.ts→b.ts"].tokens).toEqual(["foo"]);
    expect(byKey["b.ts→c.ts"].type).toBe("uses_token");
    expect(byKey["b.ts→c.ts"].tokens).toEqual(["TFoo"]);
  });

  it("--dry-run prints extractions + edges without writing any proposals", () => {
    setupProject();
    const r = runCli(tempDir, [
      "ingest", path.join(tempDir, "src"),
      "--provider", "mock",
      "--dry-run",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.fileCount).toBe(3);
    expect(parsed.okCount).toBe(3);
    expect(parsed.edges).toHaveLength(2);

    // Per-file extractions present, no proposal IDs.
    for (const result of parsed.results) {
      expect(result.ok).toBe(true);
      expect(result.extracted).toBeDefined();
      expect(result.proposalId).toBeUndefined();
    }

    // No proposals on disk.
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const proposals = fs.existsSync(proposalsDir)
      ? fs.readdirSync(proposalsDir)
      : [];
    expect(proposals).toEqual([]);
  });

  it("reports an empty walk gracefully when the directory has no .ts files", () => {
    const srcDir = path.join(tempDir, "empty-dir");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "README.md"), "# nothing here");

    const r = runCli(tempDir, [
      "ingest", srcDir,
      "--provider", "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.fileCount).toBe(0);
    expect(parsed.results).toEqual([]);
    expect(parsed.edges).toEqual([]);
  });

  it("skips node_modules / dist / .ontology / __tests__ / .git when walking", () => {
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "a.ts"),
      `/* mock-fixture\n${JSON.stringify({
        label: "real",
        level: "unit",
        kind: "rule",
        prompt: "x",
      })}\n*/`,
    );
    // Noise that should be skipped.
    for (const noiseDir of ["node_modules", "dist", "__tests__"]) {
      fs.mkdirSync(path.join(srcDir, noiseDir), { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, noiseDir, "ignored.ts"),
        `/* mock-fixture\n${JSON.stringify({
          label: "should-be-ignored",
          level: "unit",
          kind: "rule",
          prompt: "x",
        })}\n*/`,
      );
    }

    const r = runCli(tempDir, [
      "ingest", srcDir,
      "--provider", "mock",
      "--dry-run",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.fileCount).toBe(1);
    expect(parsed.results[0].extracted.label).toBe("real");
  });

  it("continues past a per-file failure and reports it in the per-file results", () => {
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    // Valid extraction.
    fs.writeFileSync(
      path.join(srcDir, "good.ts"),
      `/* mock-fixture\n${JSON.stringify({
        label: "good-one",
        level: "unit",
        kind: "rule",
        prompt: "x",
      })}\n*/`,
    );
    // No mock-fixture JSON embedded — mock returns {ok, task, echo}
    // which fails the Zod schema. Mode should continue to other files.
    fs.writeFileSync(
      path.join(srcDir, "bad.ts"),
      `// just a regular file with no embedded JSON fixture`,
    );

    const r = runCli(tempDir, [
      "ingest", srcDir,
      "--provider", "mock",
      "--dry-run",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.fileCount).toBe(2);
    expect(parsed.okCount).toBe(1);
    expect(parsed.failedCount).toBe(1);
    const failed = parsed.results.find((r: any) => !r.ok);
    expect(failed.filePath).toMatch(/bad\.ts$/);
    expect(failed.reason).toBe("schema_failed");
  });
});
