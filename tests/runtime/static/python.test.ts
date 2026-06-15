import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parsePythonFile,
  inferPythonEdgesFromDirectory,
} from "../../../src/inverse/static/python.js";
import { inferEdgesAutoFromDirectory } from "../../../src/inverse/static/edges.js";

// Coverage for the Python static-edge parser (Project Legend γ-4
// Python variant). The contract is identical to the TS-side
// `parseTypeScriptFile`/`inferEdgesFromDirectory` pair: read a file
// (or walk a directory), extract import declarations, resolve them
// to file paths under the project root, emit InferredEdge[].
//
// Tests are organised in two groups:
//   1. `parsePythonFile` — the regex-based per-file parser. Covers
//      every form in the v0 scope (import / import-as / from-import /
//      relative / wildcard / parenthesized).
//   2. `inferPythonEdgesFromDirectory` — the cross-file resolution
//      step. Covers package vs module resolution, external-import
//      dropping, ordering, and the noise-dir skip list.

describe("parsePythonFile", () => {
  it("handles simple `import foo`", () => {
    const r = parsePythonFile("/a.py", `import foo\n`);
    expect(r.imports).toHaveLength(1);
    expect(r.imports[0].modulePath).toBe("foo");
    expect(r.imports[0].imports).toEqual(["foo"]);
    expect(r.imports[0].isFromForm).toBe(false);
    expect(r.imports[0].relativeLevel).toBe(0);
  });

  it("handles dotted `import foo.bar.baz`", () => {
    const r = parsePythonFile("/a.py", `import foo.bar.baz\n`);
    expect(r.imports[0].modulePath).toBe("foo.bar.baz");
    expect(r.imports[0].imports).toEqual(["foo"]); // top-level binding
  });

  it("handles aliased `import foo as bar`", () => {
    const r = parsePythonFile("/a.py", `import foo as bar\n`);
    expect(r.imports[0].modulePath).toBe("foo");
    expect(r.imports[0].imports).toEqual(["bar"]);
  });

  it("splits multi-target `import foo, bar`", () => {
    const r = parsePythonFile("/a.py", `import foo, bar\n`);
    expect(r.imports).toHaveLength(2);
    expect(r.imports[0].modulePath).toBe("foo");
    expect(r.imports[1].modulePath).toBe("bar");
  });

  it("handles `from foo import bar`", () => {
    const r = parsePythonFile("/a.py", `from foo import bar\n`);
    expect(r.imports).toHaveLength(1);
    expect(r.imports[0].modulePath).toBe("foo");
    expect(r.imports[0].imports).toEqual(["bar"]);
    expect(r.imports[0].isFromForm).toBe(true);
    expect(r.imports[0].relativeLevel).toBe(0);
  });

  it("handles multi-symbol `from foo import bar, baz`", () => {
    const r = parsePythonFile("/a.py", `from foo import bar, baz\n`);
    expect(r.imports[0].imports).toEqual(["bar", "baz"]);
  });

  it("handles single-line parenthesized `from foo import (bar, baz)`", () => {
    const r = parsePythonFile("/a.py", `from foo import (bar, baz)\n`);
    expect(r.imports[0].imports).toEqual(["bar", "baz"]);
  });

  it("handles aliased symbol `from foo import bar as quux`", () => {
    const r = parsePythonFile("/a.py", `from foo import bar as quux\n`);
    // The original symbol is recorded for cross-file token resolution.
    expect(r.imports[0].imports).toEqual(["bar"]);
  });

  it("handles wildcard `from foo import *`", () => {
    const r = parsePythonFile("/a.py", `from foo import *\n`);
    expect(r.imports[0].imports).toEqual(["*"]);
  });

  it("handles relative `from . import foo`", () => {
    const r = parsePythonFile("/pkg/a.py", `from . import foo\n`);
    expect(r.imports[0].relativeLevel).toBe(1);
    expect(r.imports[0].modulePath).toBe("");
    expect(r.imports[0].imports).toEqual(["foo"]);
  });

  it("handles relative `from .util import helper`", () => {
    const r = parsePythonFile("/pkg/a.py", `from .util import helper\n`);
    expect(r.imports[0].relativeLevel).toBe(1);
    expect(r.imports[0].modulePath).toBe("util");
    expect(r.imports[0].imports).toEqual(["helper"]);
  });

  it("handles two-level relative `from ..util import helper`", () => {
    const r = parsePythonFile("/pkg/sub/a.py", `from ..util import helper\n`);
    expect(r.imports[0].relativeLevel).toBe(2);
    expect(r.imports[0].modulePath).toBe("util");
  });

  it("ignores `# import foo` comment lines", () => {
    const r = parsePythonFile("/a.py", `# import foo\n# from bar import baz\n`);
    expect(r.imports).toHaveLength(0);
  });

  it("strips inline comments `import foo  # used by …`", () => {
    const r = parsePythonFile("/a.py", `import foo  # used by the cache\n`);
    expect(r.imports).toHaveLength(1);
    expect(r.imports[0].modulePath).toBe("foo");
  });

  it("collects multiple top-level imports across a file", () => {
    const src = [
      `import os`,
      `import sys`,
      `from .util import helper`,
      `from typing import Dict, List`,
      ``,
      `def main():`,
      `    pass`,
      ``,
    ].join("\n");
    const r = parsePythonFile("/pkg/a.py", src);
    expect(r.imports).toHaveLength(4);
    expect(r.imports.map((i) => i.modulePath)).toEqual([
      "os",
      "sys",
      "util",
      "typing",
    ]);
  });
});

describe("inferPythonEdgesFromDirectory", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-py-edges-"));
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string) {
    const abs = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  it("resolves `from foo import bar` to foo.py", () => {
    writeFile("foo.py", `def bar():\n    return 1\n`);
    writeFile("main.py", `from foo import bar\n`);

    const edges = inferPythonEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(1);
    expect(edges[0].fromFile).toBe(path.join(projectDir, "main.py"));
    expect(edges[0].toFile).toBe(path.join(projectDir, "foo.py"));
    expect(edges[0].type).toBe("depends_on");
    expect(edges[0].tokens).toEqual(["bar"]);
  });

  it("resolves package imports to pkg/__init__.py", () => {
    writeFile("pkg/__init__.py", `export_name = 1\n`);
    writeFile("main.py", `from pkg import export_name\n`);

    const edges = inferPythonEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(1);
    expect(edges[0].toFile).toBe(path.join(projectDir, "pkg", "__init__.py"));
  });

  it("resolves dotted `import foo.bar` to foo/bar.py", () => {
    writeFile("foo/__init__.py", ``);
    writeFile("foo/bar.py", `x = 1\n`);
    writeFile("main.py", `import foo.bar\n`);

    const edges = inferPythonEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(1);
    expect(edges[0].toFile).toBe(path.join(projectDir, "foo", "bar.py"));
  });

  it("resolves relative `from .util import helper` from inside a package", () => {
    writeFile("pkg/__init__.py", ``);
    writeFile("pkg/util.py", `def helper():\n    return 1\n`);
    writeFile("pkg/main.py", `from .util import helper\n`);

    const edges = inferPythonEdgesFromDirectory(projectDir);
    const mainEdges = edges.filter((e) => e.fromFile.endsWith("main.py"));
    expect(mainEdges).toHaveLength(1);
    expect(mainEdges[0].toFile).toBe(path.join(projectDir, "pkg", "util.py"));
    expect(mainEdges[0].tokens).toEqual(["helper"]);
  });

  it("drops external imports (stdlib / pip)", () => {
    writeFile("main.py", `import os\nimport sys\nfrom typing import List\n`);

    const edges = inferPythonEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(0);
  });

  it("aggregates multiple imports from the same module into one edge", () => {
    writeFile("util.py", `def a(): pass\ndef b(): pass\ndef c(): pass\n`);
    writeFile(
      "main.py",
      `from util import a\nfrom util import b\nfrom util import c\n`,
    );

    const edges = inferPythonEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(1);
    expect(edges[0].tokens.sort()).toEqual(["a", "b", "c"]);
  });

  it("skips __pycache__ and .venv directories", () => {
    writeFile("foo.py", `\n`);
    writeFile("main.py", `from foo import x\n`);
    writeFile(
      "__pycache__/foo.cpython-311.pyc",
      `# binary content placeholder (utf-8 here)\n`,
    );
    // Even if there's a stray .py file under __pycache__, the walker
    // must skip it. (Synthetic test — real .pyc files never appear
    // as .py, but pinning the skip rule is cheap.)
    writeFile("__pycache__/should_be_ignored.py", `from foo import secret\n`);
    writeFile(".venv/lib/site-pkg/junk.py", `from foo import junk\n`);

    const edges = inferPythonEdgesFromDirectory(projectDir);
    // Only main.py → foo.py should be reported.
    expect(edges).toHaveLength(1);
    expect(edges[0].fromFile).toBe(path.join(projectDir, "main.py"));
  });

  it("produces deterministic order across runs", () => {
    writeFile("a.py", ``);
    writeFile("b.py", ``);
    writeFile("c.py", `from a import x\nfrom b import y\n`);

    const first = inferPythonEdgesFromDirectory(projectDir);
    const second = inferPythonEdgesFromDirectory(projectDir);
    expect(first).toEqual(second);
  });

  it("handles `from . import foo` (dotless relative)", () => {
    writeFile("pkg/__init__.py", ``);
    writeFile("pkg/foo.py", `x = 1\n`);
    writeFile("pkg/main.py", `from . import foo\n`);

    const edges = inferPythonEdgesFromDirectory(projectDir);
    const mainEdges = edges.filter((e) => e.fromFile.endsWith("pkg/main.py"));
    expect(mainEdges).toHaveLength(1);
    expect(mainEdges[0].toFile).toBe(path.join(projectDir, "pkg", "foo.py"));
    expect(mainEdges[0].tokens).toEqual(["foo"]);
  });
});

describe("inferEdgesAutoFromDirectory (TS + Python dispatcher)", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-mixed-edges-"));
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string) {
    const abs = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  it("returns Python-only edges when --include py", () => {
    writeFile("foo.py", `\n`);
    writeFile("main.py", `from foo import x\n`);
    writeFile("ts-file.ts", `export const z = 1;\n`); // ignored

    const edges = inferEdgesAutoFromDirectory(projectDir, ["py"]);
    expect(edges).toHaveLength(1);
    expect(edges[0].toFile).toBe(path.join(projectDir, "foo.py"));
  });

  it("returns TS-only edges when --include ts (legacy default)", () => {
    writeFile("foo.ts", `export const x = 1;\n`);
    writeFile("main.ts", `import { x } from "./foo.js";\n`);
    writeFile("py-file.py", `from foo import x\n`); // ignored

    const edges = inferEdgesAutoFromDirectory(projectDir, ["ts", "tsx"]);
    expect(edges).toHaveLength(1);
    expect(edges[0].toFile).toBe(path.join(projectDir, "foo.ts"));
  });

  it("unions edges across languages for mixed --include py,ts", () => {
    writeFile("foo.py", `\n`);
    writeFile("main.py", `from foo import x\n`);
    writeFile("foo.ts", `export const x = 1;\n`);
    writeFile("main.ts", `import { x } from "./foo.js";\n`);

    const edges = inferEdgesAutoFromDirectory(projectDir, ["py", "ts"]);
    expect(edges).toHaveLength(2);
    const toFiles = edges.map((e) => e.toFile).sort();
    expect(toFiles).toEqual(
      [path.join(projectDir, "foo.py"), path.join(projectDir, "foo.ts")].sort(),
    );
  });

  it("silently skips unknown extensions like --include rs", () => {
    writeFile("foo.rs", `fn x() {}\n`);
    writeFile("main.rs", `use crate::foo::x;\n`);

    const edges = inferEdgesAutoFromDirectory(projectDir, ["rs"]);
    expect(edges).toEqual([]);
  });
});
