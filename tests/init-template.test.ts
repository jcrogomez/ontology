import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  listTemplates,
  loadTemplate,
  validateTemplateIntegrity,
} from "../src/runtime/templates/load.js";
import { TemplateSchema } from "../src/runtime/templates/schema.js";

const CLI_PATH = path.resolve(__dirname, "../dist/cli.js");

function run(dir: string, args: string[]) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd: dir, encoding: "utf8" });
}
function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "onto-tmpl-"));
}

describe("onto init --template (seed intent-graphs)", () => {
  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error("dist/cli.js not found — run `npm run build` before this test.");
    }
  });

  // ── CLI surface ──────────────────────────────────────────────────────────

  it("--list-templates lists the shipped templates and does NOT initialise", () => {
    const dir = tmp();
    const r = run(dir, ["init", "--list-templates"]);
    expect(r.status).toBe(0);
    for (const name of ["hello-world", "rest-api", "python-cli"]) {
      expect(r.stdout).toContain(name);
    }
    expect(fs.existsSync(path.join(dir, ".ontology"))).toBe(false);
  });

  it("--template hello-world seeds a valid 5-node refinement chain with the literal artifact", () => {
    const dir = tmp();
    const init = run(dir, ["init", "--template", "hello-world"]);
    expect(init.status).toBe(0);
    expect(init.stdout).toMatch(/Seeded template "hello-world": 5 node\(s\), 5 edge\(s\)/);

    // canon + 5 seeded nodes; 5 refines edges.
    const nodeFiles = fs.readdirSync(path.join(dir, ".ontology", "nodes"));
    expect(nodeFiles.length).toBe(6);
    const edgeLines = fs
      .readFileSync(path.join(dir, ".ontology", "edges.jsonl"), "utf-8")
      .split("\n")
      .filter((l) => l.trim() !== "");
    expect(edgeLines.length).toBe(5);

    // The replay produced a structurally valid graph.
    const validate = run(dir, ["validate"]);
    expect(validate.status).toBe(0);
    expect(validate.stdout).toMatch(/STABLE/);

    // The artifact node carries the literal verbatim.
    const literals = nodeFiles
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, ".ontology", "nodes", f), "utf-8")))
      .map((n) => n.literal)
      .filter(Boolean);
    expect(literals).toContain('print("hello world")');
  });

  it("rest-api and python-cli seed valid graphs", () => {
    for (const name of ["rest-api", "python-cli"]) {
      const dir = tmp();
      const init = run(dir, ["init", "--template", name]);
      expect(init.status).toBe(0);
      const validate = run(dir, ["validate"]);
      expect(validate.status).toBe(0);
      expect(validate.stdout).toMatch(/STABLE/);
    }
  });

  it("an unknown template fails loud and lists the available ones", () => {
    const dir = tmp();
    const r = run(dir, ["init", "--template", "nonesuch"]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/Unknown template "nonesuch"/);
    expect(`${r.stderr}${r.stdout}`).toContain("hello-world");
    expect(fs.existsSync(path.join(dir, ".ontology"))).toBe(false);
  });

  // ── Loader / integrity (pure, in-process) ────────────────────────────────

  it("listTemplates / loadTemplate parse the shipped templates", () => {
    const names = listTemplates().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["hello-world", "rest-api", "python-cli"]));
    for (const name of names) {
      expect(() => loadTemplate(name)).not.toThrow();
    }
  });

  it("validateTemplateIntegrity rejects an edge to an unknown key", () => {
    const bad = TemplateSchema.parse({
      name: "bad-ref",
      description: "edge to a key that does not exist",
      nodes: [{ key: "a", level: "project", kind: "decision", prompt: "p" }],
      edges: [{ from: "a", to: "ghost", type: "refines" }],
    });
    expect(() => validateTemplateIntegrity(bad)).toThrow(/ghost/);
  });

  it("validateTemplateIntegrity rejects a refines edge that points against the poset", () => {
    const bad = TemplateSchema.parse({
      name: "bad-poset",
      description: "abstract refines concrete (inverted)",
      nodes: [
        { key: "a", level: "project", kind: "decision", prompt: "p" },
        { key: "b", level: "artifact", kind: "artifact", prompt: "p" },
      ],
      // project (abstract) → artifact (concrete) with refines is inverted.
      edges: [{ from: "a", to: "b", type: "refines" }],
    });
    expect(() => validateTemplateIntegrity(bad)).toThrow(/poset/i);
  });
});
