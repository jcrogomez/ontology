import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  writeArtifact,
  TargetExistsError,
} from "../../../src/runtime/compile/artifact-writer.js";
import {
  OntologyNodeSchema,
  type OntologyNode,
} from "../../../src/schemas/ontology.js";

// Unit-level coverage for the artifact-writer safety properties. The
// end-to-end behaviour is exercised in tests/compile-cli-target-safety.test.ts;
// here we pin the writer's contract directly so any refactor that
// changes the underlying mechanics still has to pass these assertions.

function makeArtifactNode(): OntologyNode {
  return OntologyNodeSchema.parse({
    id: "node_artifact_x",
    label: "x",
    kind: "artifact",
    status: "valid",
    coordinates: {
      abstraction: "artifact",
      time: 0,
      branch: "main",
      plane: "semantic",
      manifestation: "code",
    },
    inputs: [],
    prompt: { raw: "", variables: {}, language: "en" },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    context: { requires: [], provides: [], forbids: [], optional: [] },
    graph: { parentId: null, orbitOf: null },
    rules: [],
    technical: { language: "python" },
    outputs: { files: [] },
    integrity: { hash: "hash", schemaVersion: "1.0" },
  });
}

describe("writeArtifact — target safety", () => {
  let workDir: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-writer-test-"));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it("targeted write leaves no .tmp.<pid> sibling on success", () => {
    const targetPath = path.join(workDir, "out", "hello.py");
    writeArtifact({
      node: makeArtifactNode(),
      content: 'print("hi")',
      cwd: workDir,
      targetPath: "out/hello.py",
    });
    const siblings = fs.readdirSync(path.join(workDir, "out"));
    expect(siblings).toContain("hello.py");
    expect(siblings.filter((f) => f.startsWith("hello.py.tmp."))).toEqual([]);
    expect(fs.readFileSync(targetPath, "utf-8")).toBe('print("hi")');
  });

  it("default (non-targeted) write also leaves no .tmp.<pid> sibling", () => {
    // For the default path, the artifact lands under
    // .ontology/artifacts/generated/. The same atomic invariant applies
    // — no leftover temp files after a successful write.
    fs.mkdirSync(path.join(workDir, ".ontology", "artifacts", "generated"), { recursive: true });
    writeArtifact({
      node: makeArtifactNode(),
      content: 'print("hi")',
      cwd: workDir,
    });
    const siblings = fs.readdirSync(path.join(workDir, ".ontology", "artifacts", "generated"));
    expect(siblings).toContain("node_artifact_x.py");
    expect(siblings.filter((f) => f.includes(".tmp."))).toEqual([]);
  });

  it("throws TargetExistsError when targetPath already exists and force is unset", () => {
    const existing = path.join(workDir, "src", "main.py");
    fs.mkdirSync(path.join(workDir, "src"), { recursive: true });
    fs.writeFileSync(existing, "# original\n");

    expect(() =>
      writeArtifact({
        node: makeArtifactNode(),
        content: 'print("overwritten")',
        cwd: workDir,
        targetPath: "src/main.py",
      }),
    ).toThrow(TargetExistsError);

    // The original file is untouched — the gate fires before any write.
    expect(fs.readFileSync(existing, "utf-8")).toBe("# original\n");
  });

  it("TargetExistsError carries the cwd-relative path", () => {
    const existing = path.join(workDir, "src", "main.py");
    fs.mkdirSync(path.join(workDir, "src"), { recursive: true });
    fs.writeFileSync(existing, "# original");

    try {
      writeArtifact({
        node: makeArtifactNode(),
        content: "x",
        cwd: workDir,
        targetPath: "src/main.py",
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TargetExistsError);
      expect((err as TargetExistsError).target).toBe("src/main.py");
      expect((err as Error).message).toContain("--force");
    }
  });

  it("force: true overwrites an existing target", () => {
    const existing = path.join(workDir, "src", "main.py");
    fs.mkdirSync(path.join(workDir, "src"), { recursive: true });
    fs.writeFileSync(existing, "# original\n");

    const result = writeArtifact({
      node: makeArtifactNode(),
      content: 'print("new")',
      cwd: workDir,
      targetPath: "src/main.py",
      force: true,
    });

    expect(result.targeted).toBe(true);
    expect(fs.readFileSync(existing, "utf-8")).toBe('print("new")');
  });

  it("returns targeted=true with the override path and extension", () => {
    const result = writeArtifact({
      node: makeArtifactNode(),
      content: "x",
      cwd: workDir,
      targetPath: "deep/nested/file.ts",
    });
    expect(result.targeted).toBe(true);
    expect(result.relativePath).toBe("deep/nested/file.ts");
    expect(result.extension).toBe("ts");
  });

  it("returns targeted=false on the default generated path", () => {
    fs.mkdirSync(path.join(workDir, ".ontology", "artifacts", "generated"), { recursive: true });
    const result = writeArtifact({
      node: makeArtifactNode(),
      content: "x",
      cwd: workDir,
    });
    expect(result.targeted).toBe(false);
    expect(result.relativePath).toBe(".ontology/artifacts/generated/node_artifact_x.py");
  });
});
