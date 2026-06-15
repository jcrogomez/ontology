import { describe, it, expect } from "vitest";
import {
  classifySourceFile,
  type StructuralClassification,
} from "../src/inverse/structural-classifier.js";

// Structural Semantic Classifier v0 — focused unit tests covering
// the spec's required cases plus a few edge defenses.
//
// All fixtures inline. Pure-function tests — no IO, no network, no
// LLM calls anywhere.
//
// Convention for the assertion helper: every classification must
// carry `reasons.length > 0` and a `confidence` in [0, 1].
function assertBasicShape(c: StructuralClassification): void {
  expect(c.path).toBeTypeOf("string");
  expect(c.reasons.length).toBeGreaterThan(0);
  expect(c.confidence).toBeGreaterThanOrEqual(0);
  expect(c.confidence).toBeLessThanOrEqual(1);
  expect(c.signals).toBeDefined();
}

describe("classifySourceFile — barrel", () => {
  it("pure re-export index.ts is a barrel / module_boundary", () => {
    const c = classifySourceFile({
      path: "/proj/src/runtime/effects/index.ts",
      content: `
export * from "./result.js";
export * from "./io.js";
export { type Effect, pureEffect } from "./effect.js";
      `.trim(),
    });
    assertBasicShape(c);
    expect(c.structuralShape).toBe("barrel");
    expect(c.semanticRole).toBe("module_boundary");
    expect(c.signals.hasOnlyReExports).toBe(true);
    expect(c.confidence).toBeGreaterThanOrEqual(0.9);
    expect(c.reasons.some((r) => /re-export/i.test(r))).toBe(true);
  });

  it("a file with re-exports AND local runtime decls is NOT a barrel", () => {
    const c = classifySourceFile({
      path: "/proj/src/lib/mix.ts",
      content: `
export * from "./other.js";
export function localThing(): number { return 7; }
      `.trim(),
    });
    expect(c.structuralShape).not.toBe("barrel");
    expect(c.signals.hasOnlyReExports).toBe(false);
  });
});

describe("classifySourceFile — declaration_only", () => {
  it("interface/type-only file is declaration_only with utility/domain role", () => {
    const c = classifySourceFile({
      path: "/proj/src/runtime/context/types.ts",
      content: `
export interface ContextNode { id: string; label: string }
export type ContextEdge = { from: string; to: string };
      `.trim(),
    });
    assertBasicShape(c);
    expect(c.structuralShape).toBe("declaration_only");
    expect(["domain_model", "utility"]).toContain(c.semanticRole);
    expect(c.signals.hasInterfaces).toBe(true);
    expect(c.signals.hasRuntimeDeclarations).toBe(false);
  });

  it("file named *types.ts with only type aliases tagged as domain_model", () => {
    const c = classifySourceFile({
      path: "/proj/src/lib/user-types.ts",
      content: `export type User = { id: string; email: string };`,
    });
    expect(c.structuralShape).toBe("declaration_only");
    expect(c.semanticRole).toBe("domain_model");
  });
});

describe("classifySourceFile — test_module", () => {
  it("path with .test.ts is classified as test_module / test_specification", () => {
    const c = classifySourceFile({
      path: "/proj/tests/foo.test.ts",
      content: `
import { describe, it, expect } from "vitest";
import { foo } from "../src/foo.js";
describe("foo", () => {
  it("works", () => { expect(foo()).toBe(42); });
});
      `.trim(),
    });
    assertBasicShape(c);
    expect(c.structuralShape).toBe("test_module");
    expect(c.semanticRole).toBe("test_specification");
    expect(c.signals.hasVitest).toBe(true);
  });

  it("path under tests/ but with no vitest signal still classifies as test_module", () => {
    const c = classifySourceFile({
      path: "/proj/tests/helpers/factory.ts",
      content: `export function makeFixture() { return {}; }`,
    });
    expect(c.structuralShape).toBe("test_module");
  });
});

describe("classifySourceFile — configuration_module", () => {
  it("vite.config.ts is configuration / configuration_module", () => {
    const c = classifySourceFile({
      path: "/proj/vite.config.ts",
      content: `
import { defineConfig } from "vite";
export default defineConfig({ build: { target: "es2022" } });
      `.trim(),
    });
    assertBasicShape(c);
    expect(c.structuralShape).toBe("configuration_module");
    expect(c.semanticRole).toBe("configuration");
  });

  it("vitest.config.ts is configuration_module", () => {
    const c = classifySourceFile({
      path: "/proj/vitest.config.ts",
      content: `import { defineConfig } from "vitest/config"; export default defineConfig({});`,
    });
    expect(c.structuralShape).toBe("configuration_module");
  });

  it("plain package.json is configuration_module / configuration", () => {
    const c = classifySourceFile({
      path: "/proj/package.json",
      content: `{ "name": "x", "version": "1.0.0" }`,
    });
    expect(c.structuralShape).toBe("configuration_module");
    expect(c.semanticRole).toBe("configuration");
  });
});

describe("classifySourceFile — component_module", () => {
  it("TSX file with JSX + uppercase exported function is component / ui_surface", () => {
    const c = classifySourceFile({
      path: "/proj/src/walker/Button.tsx",
      content: `
import React from "react";
export function Button(props: { label: string }) {
  return <button>{props.label}</button>;
}
      `.trim(),
    });
    assertBasicShape(c);
    expect(c.structuralShape).toBe("component_module");
    expect(c.semanticRole).toBe("ui_surface");
    expect(c.signals.hasJsx).toBe(true);
    expect(c.signals.hasReactComponent).toBe(true);
  });
});

describe("classifySourceFile — schema_module", () => {
  it("Zod import + z.object call is schema_module / validation_schema", () => {
    const c = classifySourceFile({
      path: "/proj/src/schemas/user.ts",
      content: `
import { z } from "zod";
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
});
      `.trim(),
    });
    assertBasicShape(c);
    expect(c.structuralShape).toBe("schema_module");
    expect(c.semanticRole).toBe("validation_schema");
    expect(c.signals.hasZodSchema).toBe(true);
  });
});

describe("classifySourceFile — adapter_module", () => {
  it("path src/runtime/llm/*adapter.ts is adapter_module / llm_adapter", () => {
    const c = classifySourceFile({
      path: "/proj/src/runtime/llm/ollama/adapter.ts",
      content: `
import { Ollama } from "ollama";
export function createOllamaAdapter() {
  return { generate: async () => ({}) };
}
      `.trim(),
    });
    assertBasicShape(c);
    expect(c.structuralShape).toBe("adapter_module");
    expect(c.semanticRole).toBe("llm_adapter");
  });
});

describe("classifySourceFile — cli_module", () => {
  it("file importing commander is cli_module / command_surface", () => {
    const c = classifySourceFile({
      path: "/proj/src/cli.ts",
      content: `
import { Command } from "commander";
const program = new Command();
program.command("hello").action(() => { console.log("hi"); });
      `.trim(),
    });
    assertBasicShape(c);
    expect(c.structuralShape).toBe("cli_module");
    expect(c.semanticRole).toBe("command_surface");
    expect(c.signals.hasCliEntrypoint).toBe(true);
  });

  it("file under src/commands/ with runtime decls is cli_module", () => {
    const c = classifySourceFile({
      path: "/proj/src/commands/init.ts",
      content: `export async function initCommand(): Promise<void> { /* ... */ const x = 1; }`,
    });
    expect(c.structuralShape).toBe("cli_module");
    expect(c.semanticRole).toBe("command_surface");
  });
});

describe("classifySourceFile — executable_module (default for normal runtime files)", () => {
  it("regular module with functions only is executable_module / runtime_policy", () => {
    const c = classifySourceFile({
      path: "/proj/src/core/integrity/hash.ts",
      content: `
import { createHash } from "node:crypto";
export function hashObject(o: unknown): string {
  return createHash("sha256").update(JSON.stringify(o)).digest("hex");
}
      `.trim(),
    });
    assertBasicShape(c);
    expect(c.structuralShape).toBe("executable_module");
    expect(c.semanticRole).toBe("runtime_policy");
    expect(c.signals.hasFunctions).toBe(true);
    expect(c.signals.hasRuntimeDeclarations).toBe(true);
  });
});

describe("classifySourceFile — markdown / unknown", () => {
  it("markdown file is unknown / unknown with low confidence", () => {
    const c = classifySourceFile({
      path: "/proj/README.md",
      content: "# Title\n\nProse.",
    });
    expect(c.structuralShape).toBe("unknown");
    expect(c.semanticRole).toBe("unknown");
    expect(c.confidence).toBeLessThan(0.5);
  });

  it("unknown extension is also unknown / unknown", () => {
    const c = classifySourceFile({
      path: "/proj/data.txt",
      content: "anything",
    });
    expect(c.structuralShape).toBe("unknown");
    expect(c.semanticRole).toBe("unknown");
  });
});

describe("classifySourceFile — every classification carries reasons + confidence", () => {
  const samples: Array<{ name: string; path: string; content: string }> = [
    { name: "barrel", path: "/p/index.ts", content: 'export * from "./a.js";' },
    { name: "test", path: "/p/x.test.ts", content: "import {} from 'vitest';" },
    { name: "schema", path: "/p/s.ts", content: 'import {z} from "zod"; export const S = z.object({});' },
    { name: "config", path: "/p/vite.config.ts", content: "export default {};" },
    { name: "runtime", path: "/p/util.ts", content: "export function f() {}" },
    { name: "declaration", path: "/p/types.ts", content: "export interface I {}" },
  ];
  for (const s of samples) {
    it(`sample '${s.name}' has reasons + confidence in [0, 1]`, () => {
      const c = classifySourceFile({ path: s.path, content: s.content });
      expect(c.reasons.length).toBeGreaterThan(0);
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    });
  }
});
