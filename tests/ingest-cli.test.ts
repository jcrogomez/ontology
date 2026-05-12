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
    expect(r.stderr).toMatch(/Could not read/);
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
