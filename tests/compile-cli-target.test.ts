import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Coverage for `onto compile run --target <path>` (Project Legend Phase β-1).
// The target override redirects the focal artifact off the default
// `.ontology/artifacts/generated/` tree without affecting upstream steps
// or the audit chain shape (every step still emits compilation_run +
// persisted run records).

function setupHelloWorld(tempDir: string): void {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Greeting domain"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create",
    "--level", "artifact",
    "--kind", "artifact",
    "--manifestation", "code",
    "--language", "python",
    "--prompt", 'print("hello world")',
  ]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
}

describe("onto compile run --target", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    setupHelloWorld(tempDir);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("writes the focal artifact to the target path (relative)", () => {
    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--target", "src/hello.py",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    // The reported relative path tracks the override, not the default tree.
    expect(parsed.focalArtifact.path).toBe("src/hello.py");
    expect(parsed.focalArtifact.extension).toBe("py");

    const targeted = path.join(tempDir, "src/hello.py");
    expect(fs.existsSync(targeted)).toBe(true);
    expect(fs.readFileSync(targeted, "utf-8")).toBe('print("hello world")');
  });

  it("creates missing parent directories of the target path", () => {
    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--target", "deep/nested/dir/hello.py",
    ]);
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, "deep/nested/dir/hello.py"))).toBe(true);
  });

  it("redirects only the focal — upstream steps still land under generated/", () => {
    runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--target", "src/hello.py",
    ]);
    // Focal lives at the override.
    expect(fs.existsSync(path.join(tempDir, "src/hello.py"))).toBe(true);
    // Focal does NOT live at the default location (it was redirected).
    expect(fs.existsSync(path.join(tempDir, ".ontology/artifacts/generated/node_0002.py"))).toBe(false);
    // Upstream (canon + domain) are unaffected.
    expect(fs.existsSync(path.join(tempDir, ".ontology/artifacts/generated/node_0000_canon.txt"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, ".ontology/artifacts/generated/node_0001.txt"))).toBe(true);
  });

  it("the compilation_run event records the targeted path", () => {
    runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--target", "src/hello.py",
    ]);
    const events = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8")
      .trim().split("\n").map((l) => JSON.parse(l));
    const focalEvent = events.find(
      (e) => e.eventType === "compilation_run" && e.payload.nodeId === "node_0002",
    );
    expect(focalEvent).toBeDefined();
    expect(focalEvent.payload.artifactRelativePath).toBe("src/hello.py");
  });
});
