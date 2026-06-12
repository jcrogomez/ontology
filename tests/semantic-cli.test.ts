import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// End-to-end coverage of the semantic pipeline at $0 (mock embeddings):
//   onto semantic index → onto semantic links → --propose (governed gate)
//   → onto query --semantic (hybrid retrieval).
//
// The fixture graph has two nodes sharing compiler vocabulary and one
// unrelated podcast node, so similarity assertions are meaningful under the
// mock's bag-of-words feature hashing.

function createNode(tempDir: string, label: string, prompt: string): string {
  const r = runCli(tempDir, [
    "node", "create",
    "--level", "domain",
    "--kind", "entity",
    "--label", label,
    "--prompt", prompt,
  ]);
  expect(r.status).toBe(0);
  const match = (r.stdout + r.stderr).match(/node_\d+/);
  expect(match).not.toBeNull();
  return match![0];
}

describe("onto semantic — index, links, hybrid query (mock, $0)", () => {
  let tempDir: string;
  let compilerId: string;
  let docsId: string;
  let podcastId: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    compilerId = createNode(
      tempDir,
      "compiler functor",
      "compile intent graph into code artifacts deterministically",
    );
    docsId = createNode(
      tempDir,
      "compiler documentation",
      "document how the compiler turns intent into code artifacts",
    );
    podcastId = createNode(
      tempDir,
      "podcast briefing",
      "draft a radio briefing about broccoli seeds and irrigation",
    );
  });

  afterEach(() => cleanupTempProject(tempDir));

  function buildIndex(): any {
    const r = runCli(tempDir, ["semantic", "index", "--provider", "mock", "--json"]);
    expect(r.status).toBe(0);
    return JSON.parse(r.stdout);
  }

  it("semantic index embeds every node with intent text and persists the index", () => {
    const parsed = buildIndex();
    expect(parsed.ok).toBe(true);
    // canon + 3 created nodes
    expect(parsed.report.indexedNodes).toBe(4);
    expect(parsed.report.embedded).toBe(4);
    expect(parsed.report.reused).toBe(0);
    expect(
      fs.existsSync(path.join(tempDir, ".ontology/embeddings/index.json")),
    ).toBe(true);
  });

  it("re-indexing reuses every unchanged vector (incremental, content-addressed)", () => {
    buildIndex();
    const second = buildIndex();
    expect(second.report.embedded).toBe(0);
    expect(second.report.reused).toBe(4);

    // Touch one node's prompt → exactly one re-embed.
    const r = runCli(tempDir, [
      "node", "update", podcastId,
      "--prompt", "draft a radio briefing about tomato seedlings",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const third = buildIndex();
    expect(third.report.embedded).toBe(1);
    expect(third.report.reused).toBe(3);
  });

  it("semantic links surfaces the compiler pair above the podcast pairings", () => {
    buildIndex();
    const r = runCli(tempDir, [
      "semantic", "links", "--threshold", "0.2", "--top", "5", "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.report.pairs.length).toBeGreaterThan(0);
    const best = parsed.report.pairs[0];
    expect([best.from, best.to].sort()).toEqual([compilerId, docsId].sort());
  });

  it("--propose without --type is refused — the human picks edge semantics", () => {
    buildIndex();
    const r = runCli(tempDir, ["semantic", "links", "--propose", "--json"]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).ok).toBe(false);
  });

  it("--propose --type creates governed proposals that apply into real edges", () => {
    buildIndex();
    const r = runCli(tempDir, [
      "semantic", "links",
      "--threshold", "0.5", "--top", "1",
      "--propose", "--type", "documents",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.report.proposals.length).toBe(1);
    const proposalId = parsed.report.proposals[0].proposalId;

    // The proposal carries the similarity rationale (provenance of the hypothesis).
    const show = runCli(tempDir, ["proposal", "show", proposalId, "--json"]);
    expect(show.status).toBe(0);
    expect(show.stdout).toContain("semantic similarity");

    // It passes the same gate as any mutation: apply creates the edge.
    const apply = runCli(tempDir, ["proposal", "apply", proposalId, "--json"]);
    expect(apply.status).toBe(0);
    const edges = fs
      .readFileSync(path.join(tempDir, ".ontology/edges.jsonl"), "utf-8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(
      edges.some(
        (e) =>
          e.type === "documents" &&
          [e.from, e.to].sort().join(",") === [compilerId, docsId].sort().join(","),
      ),
    ).toBe(true);

    // The suggested pair is linked now — it must not be re-suggested.
    const again = runCli(tempDir, [
      "semantic", "links", "--threshold", "0.5", "--top", "5", "--json",
    ]);
    const reParsed = JSON.parse(again.stdout);
    expect(
      reParsed.report.pairs.some(
        (p: any) => [p.from, p.to].sort().join(",") === [compilerId, docsId].sort().join(","),
      ),
    ).toBe(false);
  });

  it("semantic links without an index fails with a pointer to `onto semantic index`", () => {
    const r = runCli(tempDir, ["semantic", "links", "--json"]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).error).toContain("semantic index");
  });

  it("query --semantic re-ranks structural matches by similarity", () => {
    buildIndex();
    const r = runCli(tempDir, [
      "query", "--kind", "entity", "--semantic", "compiling intent into code", "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.count).toBe(3); // canon is kind=canon → filtered structurally
    // Which of the two compiler-vocabulary nodes wins is a norm detail of the
    // bag-of-words mock; the meaningful invariant is: compiler family above,
    // podcast last, scores strictly ordered.
    expect([compilerId, docsId]).toContain(parsed.nodes[0].id);
    expect(parsed.nodes[parsed.count - 1].id).toBe(podcastId);
    expect(parsed.scores.length).toBe(3);
    expect(parsed.scores[0]).toBeGreaterThan(parsed.scores[2]);
  });

  it("query --semantic respects --top and the structural filter stays primary", () => {
    buildIndex();
    const r = runCli(tempDir, [
      "query", "--kind", "entity", "--semantic", "compiler", "--top", "1", "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.count).toBe(1);

    // A shape that excludes everything returns nothing regardless of similarity.
    const none = runCli(tempDir, [
      "query", "--kind", "rule", "--semantic", "compiler", "--json",
    ]);
    expect(JSON.parse(none.stdout).count).toBe(0);
  });

  it("query --semantic without an index fails with a pointer", () => {
    const r = runCli(tempDir, ["query", "--semantic", "anything", "--json"]);
    expect(r.status).toBe(1);
  });
});
