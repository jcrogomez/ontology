import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  parseRustFile,
  inferRustEdgesFromDirectory,
  rustBackendAvailable,
} from "../src/runtime/static/rust.js";
import { inferEdgesAutoFromDirectoryAsync } from "../src/runtime/static/edges.js";

// γ-4-rust — the tree-sitter backend behind the same two-function contract
// as typescript.ts / python.ts. The fixture is a miniature crate exercising
// the v0 surface: `mod` declarations (both sibling-file and dir/mod.rs
// forms), `use crate::...` paths with grouped lists and aliases, and
// external imports (std) that must NOT produce edges.
//
// web-tree-sitter + tree-sitter-wasms are devDependencies of this repo, so
// the backend is available here; the availability gate is still asserted
// explicitly so a broken optional install fails loudly, not silently.

let tempDir: string;

function write(rel: string, content: string): string {
  const abs = path.join(tempDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

function makeCrate(): void {
  write(
    "src/main.rs",
    [
      "mod config;",
      "mod helpers;",
      "use crate::config::Settings;",
      "use crate::helpers::util::{parse, format as fmt};",
      "use std::collections::HashMap;",
      "fn main() { let _: (Settings, HashMap<i32, i32>); parse(); fmt(); }",
    ].join("\n"),
  );
  write("src/config.rs", "pub struct Settings { pub name: String }\n");
  write("src/helpers/mod.rs", "pub mod util;\n");
  write(
    "src/helpers/util.rs",
    [
      "use super::super::config::Settings;",
      "pub fn parse() {}",
      "pub fn format() {}",
    ].join("\n"),
  );
}

describe("rust static edges (tree-sitter γ-4-rust)", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-rust-"));
    makeCrate();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("the optional backend is available in this repo (devDependencies)", async () => {
    expect(await rustBackendAvailable()).toBe(true);
  });

  it("parseRustFile extracts mod and use imports with resolution", async () => {
    const mainAbs = path.join(tempDir, "src/main.rs");
    const parsed = await parseRustFile(mainAbs, fs.readFileSync(mainAbs, "utf-8"), {
      crateRoot: path.join(tempDir, "src"),
    });

    const byPath = Object.fromEntries(parsed.imports.map((i) => [i.modulePath, i]));

    // mod declarations resolve to sibling file / dir-with-mod.rs.
    expect(byPath["config"].form).toBe("mod");
    expect(byPath["config"].resolvedPath).toBe(path.join(tempDir, "src/config.rs"));
    expect(byPath["helpers"].resolvedPath).toBe(path.join(tempDir, "src/helpers/mod.rs"));

    // use crate::... resolves along the module tree to the deepest module file.
    expect(byPath["crate::config::Settings"].resolvedPath).toBe(
      path.join(tempDir, "src/config.rs"),
    );
    expect(byPath["crate::config::Settings"].imports).toEqual(["Settings"]);

    // Grouped list flattens; the alias keeps the ORIGINAL symbol name.
    expect(byPath["crate::helpers::util::parse"].resolvedPath).toBe(
      path.join(tempDir, "src/helpers/util.rs"),
    );
    expect(byPath["crate::helpers::util::format"].imports).toEqual(["format"]);

    // std is external: recorded, but unresolved.
    expect(byPath["std::collections::HashMap"].resolvedPath).toBeNull();
  });

  it("inferRustEdgesFromDirectory produces grouped, sorted depends_on edges", async () => {
    const edges = await inferRustEdgesFromDirectory(tempDir);
    const rel = edges.map((e) => ({
      from: path.relative(tempDir, e.fromFile),
      to: path.relative(tempDir, e.toFile),
      type: e.type,
      tokens: e.tokens,
    }));

    // main.rs → config.rs groups the mod decl and the use into ONE edge.
    const mainToConfig = rel.find((e) => e.from === "src/main.rs" && e.to === "src/config.rs");
    expect(mainToConfig).toBeDefined();
    expect(mainToConfig!.type).toBe("depends_on");
    expect(mainToConfig!.tokens).toEqual(["Settings", "config"]);

    const mainToHelpers = rel.find(
      (e) => e.from === "src/main.rs" && e.to === "src/helpers/mod.rs",
    );
    expect(mainToHelpers!.tokens).toEqual(["helpers"]);

    const mainToUtil = rel.find(
      (e) => e.from === "src/main.rs" && e.to === "src/helpers/util.rs",
    );
    expect(mainToUtil!.tokens).toEqual(["format", "parse"]);

    // helpers/mod.rs → helpers/util.rs via `pub mod util;`.
    const modToUtil = rel.find(
      (e) => e.from === "src/helpers/mod.rs" && e.to === "src/helpers/util.rs",
    );
    expect(modToUtil!.tokens).toEqual(["util"]);

    // util.rs → config.rs via use super::super::...
    const utilToConfig = rel.find(
      (e) => e.from === "src/helpers/util.rs" && e.to === "src/config.rs",
    );
    expect(utilToConfig).toBeDefined();
    expect(utilToConfig!.tokens).toEqual(["Settings"]);

    // No edge ever targets std (external imports drop out).
    expect(rel.every((e) => e.to.endsWith(".rs"))).toBe(true);

    // Deterministic order.
    const keys = rel.map((e) => `${e.from}→${e.to}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("the async dispatcher unions rust with the other languages on --include rs", async () => {
    write(
      "src/extra.ts",
      `import { foo } from "./other.js";\nexport const x = foo;\n`,
    );
    write("src/other.ts", `export const foo = 1;\n`);

    const edges = await inferEdgesAutoFromDirectoryAsync(tempDir, ["ts", "rs"]);
    const rel = edges.map((e) => ({
      from: path.relative(tempDir, e.fromFile),
      to: path.relative(tempDir, e.toFile),
    }));
    expect(rel.some((e) => e.from === "src/extra.ts" && e.to === "src/other.ts")).toBe(true);
    expect(rel.some((e) => e.from === "src/main.rs" && e.to === "src/config.rs")).toBe(true);

    // Without "rs" in the include list the rust edges stay out.
    const tsOnly = await inferEdgesAutoFromDirectoryAsync(tempDir, ["ts"]);
    expect(tsOnly.every((e) => !e.fromFile.endsWith(".rs"))).toBe(true);
  });
});
