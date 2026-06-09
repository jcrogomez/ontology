import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  AbstractionLevelSchema,
  ManifestationSchema,
  NodeKindSchema,
} from "../src/schemas/ontology.js";
import { buildStaticSummary } from "../src/runtime/legend/static-summary.js";
import { decideStaticClassifierIngestAction } from "../src/commands/ingest/static-classifier-policy.js";
import { classifySourceFile } from "../src/runtime/legend/structural-classifier.js";
import type {
  StructuralClassification,
  StructuralShape,
  SemanticRole,
  ClassificationVocabulary,
} from "../src/runtime/legend/structural-classifier.js";

// Mirror of ExtractionResultSchema from src/commands/ingest/index.ts.
// Imported separately here (rather than from the commands module) to
// keep the unit test free of CLI / runtime coupling — the contract
// under test is that buildStaticSummary outputs validate against the
// same Zod shape the proposal layer enforces.
//
// IMPORTANT: keep the refine on requires/provides in sync with the
// real SymbolNameSchema in src/commands/ingest/index.ts. Phase ε β′
// (2026-05-16) Move 1b added a vocabulary-domain guard that rejects
// module paths and source-file specifiers; the mirror enforces it
// here so buildStaticSummary regressions surface in this suite, not
// only in the heavier integration tests.
const SymbolNameMirror = z
  .string()
  .min(1)
  .refine(
    (s) => !/^\.\.?\//.test(s) && !/\.(js|ts|tsx|jsx|mjs|cjs)$/.test(s),
    { message: "requires/provides must be symbol names, not module paths" },
  );

const ExtractionResultSchema = z.object({
  label: z.string().min(1).max(256),
  level: AbstractionLevelSchema,
  kind: NodeKindSchema,
  manifestation: ManifestationSchema.optional(),
  language: z.string().optional(),
  prompt: z.string().min(1),
  requires: z.array(SymbolNameMirror).optional(),
  provides: z.array(SymbolNameMirror).optional(),
  forbids: z.array(z.string()).optional(),
  rules: z.array(z.string()).optional(),
});

function fixtureClassification(args: {
  path?: string;
  shape: StructuralShape;
  role?: SemanticRole;
  reExportCount?: number;
  vocabulary?: ClassificationVocabulary;
}): StructuralClassification {
  return {
    path: args.path ?? "src/index.ts",
    language: "typescript",
    structuralShape: args.shape,
    semanticRole: args.role ?? "module_boundary",
    confidence: 0.9,
    reasons: ["fixture"],
    signals: {
      reExportCount: args.reExportCount,
    },
    vocabulary: args.vocabulary,
  };
}

describe("buildStaticSummary — barrel (with vocabulary)", () => {
  const barrelClassification = fixtureClassification({
    path: "src/runtime/effects/index.ts",
    shape: "barrel",
    role: "module_boundary",
    reExportCount: 3,
    vocabulary: {
      exports: [
        { name: "io", kind: "value", reExportedFrom: "./io.js" },
        { name: "result", kind: "value", reExportedFrom: "./result.js" },
        { name: "laws", kind: "value", reExportedFrom: "./laws.js" },
      ],
      imports: [
        { modulePath: "./io.js", kind: "value", symbols: ["io"] },
        { modulePath: "./result.js", kind: "value", symbols: ["result"] },
        { modulePath: "./laws.js", kind: "value", symbols: ["laws"] },
        // A wildcard re-export: appears in imports with empty symbols.
        { modulePath: "./async.js", kind: "value", symbols: [] },
      ],
    },
  });

  it("produces a valid ExtractionResult", () => {
    const summary = buildStaticSummary({
      filePath: "src/runtime/effects/index.ts",
      classification: barrelClassification,
    });
    const parsed = ExtractionResultSchema.safeParse(summary);
    expect(parsed.success).toBe(true);
  });

  it("provides is NOT empty — named re-export names land in provides", () => {
    const summary = buildStaticSummary({
      filePath: "src/runtime/effects/index.ts",
      classification: barrelClassification,
    });
    expect(summary.provides).toEqual(["io", "result", "laws"]);
  });

  it("requires lists imported SYMBOL NAMES (not module paths — Move 1b)", () => {
    const summary = buildStaticSummary({
      filePath: "src/runtime/effects/index.ts",
      classification: barrelClassification,
    });
    // Post-Move-1b (Phase ε 2026-05-18): requires carries symbol
    // names so the gluing check (which compares against upstream
    // `provides` arrays of symbol names) can resolve. Wildcard
    // re-exports (`./async.js` with `symbols: []`) contribute zero
    // entries — the AST does not surface their symbol set. The prompt
    // still mentions module paths separately for compile-back context
    // (see the prompt assertion below).
    expect(summary.requires).toEqual(["io", "result", "laws"]);
  });

  it("prompt mentions specific re-export module specifiers and names", () => {
    const summary = buildStaticSummary({
      filePath: "src/runtime/effects/index.ts",
      classification: barrelClassification,
    });
    // Named re-exports surface with the module path and the symbol names.
    expect(summary.prompt).toContain("./io.js");
    expect(summary.prompt).toContain("./result.js");
    expect(summary.prompt).toContain("./laws.js");
    expect(summary.prompt).toContain("io");
    expect(summary.prompt).toContain("result");
    expect(summary.prompt).toContain("laws");
    // Wildcard re-exports surface with the module path.
    expect(summary.prompt).toContain("./async.js");
    expect(summary.prompt).toMatch(/Wildcard re-exports/);
  });

  it("uses kind=artifact, level=artifact, manifestation=code", () => {
    const summary = buildStaticSummary({
      filePath: "src/runtime/effects/index.ts",
      classification: barrelClassification,
    });
    expect(summary.kind).toBe("artifact");
    expect(summary.level).toBe("artifact");
    expect(summary.manifestation).toBe("code");
  });

  it("output is deterministic across calls", () => {
    const a = buildStaticSummary({
      filePath: "src/runtime/effects/index.ts",
      classification: barrelClassification,
    });
    const b = buildStaticSummary({
      filePath: "src/runtime/effects/index.ts",
      classification: barrelClassification,
    });
    expect(a).toEqual(b);
  });
});

describe("buildStaticSummary — barrel with grouped named re-exports", () => {
  it("groups multiple named re-exports from the same module in the prompt", () => {
    const classification = fixtureClassification({
      path: "src/topos/index.ts",
      shape: "barrel",
      vocabulary: {
        exports: [
          { name: "Predicate", kind: "value", reExportedFrom: "./predicate.js" },
          { name: "Omega", kind: "value", reExportedFrom: "./omega.js" },
          { name: "RuleCompiler", kind: "value", reExportedFrom: "./predicate.js" },
        ],
        imports: [
          {
            modulePath: "./predicate.js",
            kind: "value",
            symbols: ["Predicate", "RuleCompiler"],
          },
          { modulePath: "./omega.js", kind: "value", symbols: ["Omega"] },
        ],
      },
    });
    const summary = buildStaticSummary({
      filePath: "src/topos/index.ts",
      classification,
    });
    // provides preserves source-file order across modules.
    expect(summary.provides).toEqual(["Predicate", "Omega", "RuleCompiler"]);
    // Prompt groups: predicate.js block lists both names; omega.js lists Omega only.
    expect(summary.prompt).toMatch(/from `\.\/predicate\.js`:.*Predicate.*RuleCompiler/);
    expect(summary.prompt).toMatch(/from `\.\/omega\.js`:.*Omega/);
  });
});

describe("buildStaticSummary — barrel with empty vocabulary (regression fallback)", () => {
  it("produces a valid ExtractionResult even when vocabulary is undefined", () => {
    const classification = fixtureClassification({
      path: "src/x/index.ts",
      shape: "barrel",
      // vocabulary intentionally absent.
    });
    const summary = buildStaticSummary({
      filePath: "src/x/index.ts",
      classification,
    });
    const parsed = ExtractionResultSchema.safeParse(summary);
    expect(parsed.success).toBe(true);
    // Empty vocabulary → empty provides/requires; prompt uses the
    // generic fallback prose.
    expect(summary.provides).toEqual([]);
    expect(summary.requires).toEqual([]);
    expect(summary.prompt).toContain("decouple importers");
  });
});

describe("buildStaticSummary — declaration_only (with vocabulary)", () => {
  const typesClassification = fixtureClassification({
    path: "src/runtime/context/types.ts",
    shape: "declaration_only",
    role: "domain_model",
    vocabulary: {
      exports: [
        { name: "ContextRequirement", kind: "type" },
        { name: "ContextProvision", kind: "type" },
        { name: "ContextContract", kind: "type" },
      ],
      imports: [
        {
          modulePath: "../../schemas/ontology.js",
          kind: "type",
          symbols: ["AbstractionLevel", "NodeKind"],
        },
      ],
    },
  });

  it("produces a valid ExtractionResult", () => {
    const summary = buildStaticSummary({
      filePath: "src/runtime/context/types.ts",
      classification: typesClassification,
    });
    const parsed = ExtractionResultSchema.safeParse(summary);
    expect(parsed.success).toBe(true);
  });

  it("provides is NOT empty — declared type names land in provides", () => {
    const summary = buildStaticSummary({
      filePath: "src/runtime/context/types.ts",
      classification: typesClassification,
    });
    expect(summary.provides).toEqual([
      "ContextRequirement",
      "ContextProvision",
      "ContextContract",
    ]);
  });

  it("requires lists module specifiers used by the type declarations", () => {
    const summary = buildStaticSummary({
      filePath: "src/runtime/context/types.ts",
      classification: typesClassification,
    });
    // Post-Move-1b: requires carries imported SYMBOL NAMES, not
    // module paths — matches the gluing check's vocabulary.
    expect(summary.requires).toEqual(["AbstractionLevel", "NodeKind"]);
  });

  it("prompt mentions the declared type names AND the imported symbols", () => {
    const summary = buildStaticSummary({
      filePath: "src/runtime/context/types.ts",
      classification: typesClassification,
    });
    expect(summary.prompt).toContain("ContextRequirement");
    expect(summary.prompt).toContain("ContextProvision");
    expect(summary.prompt).toContain("ContextContract");
    expect(summary.prompt).toContain("AbstractionLevel");
    expect(summary.prompt).toContain("NodeKind");
  });

  it("uses kind=definition", () => {
    const summary = buildStaticSummary({
      filePath: "src/runtime/context/types.ts",
      classification: typesClassification,
    });
    expect(summary.kind).toBe("definition");
    expect(summary.label.toLowerCase()).toContain("types");
  });

  it("output is deterministic across calls", () => {
    const a = buildStaticSummary({
      filePath: "src/runtime/context/types.ts",
      classification: typesClassification,
    });
    const b = buildStaticSummary({
      filePath: "src/runtime/context/types.ts",
      classification: typesClassification,
    });
    expect(a).toEqual(b);
  });
});

describe("buildStaticSummary — guard against unsupported shapes", () => {
  it.each<StructuralShape>([
    "executable_module",
    "component_module",
    "test_module",
    "configuration_module",
    "schema_module",
    "adapter_module",
    "cli_module",
    "mixed_module",
    "unknown",
  ])("throws for shape %s", (shape) => {
    const classification = fixtureClassification({ shape });
    expect(() =>
      buildStaticSummary({ filePath: "src/x.ts", classification }),
    ).toThrow(/unsupported shape/i);
  });
});

describe("decideStaticClassifierIngestAction", () => {
  it("returns semantic_parse when mode is off, regardless of shape", () => {
    for (const shape of [
      "barrel",
      "declaration_only",
      "executable_module",
    ] as StructuralShape[]) {
      const action = decideStaticClassifierIngestAction(
        fixtureClassification({ shape }),
        "off",
      );
      expect(action).toBe("semantic_parse");
    }
  });

  it("returns semantic_parse when mode is report-only, regardless of shape", () => {
    for (const shape of [
      "barrel",
      "declaration_only",
      "executable_module",
      "schema_module",
    ] as StructuralShape[]) {
      const action = decideStaticClassifierIngestAction(
        fixtureClassification({ shape }),
        "report-only",
      );
      expect(action).toBe("semantic_parse");
    }
  });

  it("returns static_summary for barrel in enabled mode", () => {
    const action = decideStaticClassifierIngestAction(
      fixtureClassification({ shape: "barrel" }),
      "enabled",
    );
    expect(action).toBe("static_summary");
  });

  it("returns static_summary for declaration_only in enabled mode", () => {
    const action = decideStaticClassifierIngestAction(
      fixtureClassification({ shape: "declaration_only" }),
      "enabled",
    );
    expect(action).toBe("static_summary");
  });

  // Conservatism: every other shape must still hit the LLM. The
  // schema_module case is load-bearing — the classifier's zod
  // predicate overfits on files that USE zod for runtime validation
  // but ARE NOT pure schemas, so treating schema_module as static
  // would import that false positive into intent extraction.
  it.each<StructuralShape>([
    "schema_module",
    "adapter_module",
    "cli_module",
    "executable_module",
    "component_module",
    "test_module",
    "configuration_module",
    "mixed_module",
    "unknown",
  ])("returns semantic_parse for %s in enabled mode", (shape) => {
    const action = decideStaticClassifierIngestAction(
      fixtureClassification({ shape }),
      "enabled",
    );
    expect(action).toBe("semantic_parse");
  });

  it("returns semantic_parse when classification is missing, in any mode", () => {
    expect(decideStaticClassifierIngestAction(undefined, "off")).toBe(
      "semantic_parse",
    );
    expect(decideStaticClassifierIngestAction(undefined, "report-only")).toBe(
      "semantic_parse",
    );
    expect(decideStaticClassifierIngestAction(undefined, "enabled")).toBe(
      "semantic_parse",
    );
  });
});

// ── Regression: the exact β-self-ingest failure mode ───────────────────────
//
// β-self-ingest (2026-05-16) revealed that buildStaticSummary was
// emitting `provides: []` and `requires: []` for barrels and
// declaration-only modules. Compile-back then had no vocabulary to
// anchor regen, and round-trip Jaccard collapsed to 0. The two tests
// below pin the fix: given a real-shaped fixture, the builder MUST
// surface enough vocabulary that a downstream consumer could
// reproduce the export surface from the extraction alone.

describe("β-self-ingest regression — vocabulary is preserved end-to-end", () => {
  it("classify(barrel content) → buildStaticSummary populates provides + requires from AST", () => {
    const filePath = "src/x/index.ts";
    const content = [
      `export { foo, bar } from "./alpha.js";`,
      `export { baz } from "./beta.js";`,
      `export * from "./gamma.js";`,
      ``,
    ].join("\n");
    const classification = classifySourceFile({ path: filePath, content });
    expect(classification.structuralShape).toBe("barrel");
    expect(classification.vocabulary).toBeDefined();

    const summary = buildStaticSummary({
      filePath,
      classification,
    });
    // Named re-exports surface as provides — exact AST order.
    expect(summary.provides).toEqual(["foo", "bar", "baz"]);
    // Post-Move-1b: requires carries imported SYMBOL NAMES from
    // named re-exports. Wildcard re-exports (`export * from
    // "./gamma.js"`) have no symbols at the AST layer and
    // contribute zero entries — gamma is still mentioned in the
    // prompt below for compile-back context.
    expect(summary.requires).toEqual(["foo", "bar", "baz"]);
    // Prompt mentions all three upstream specifiers + the named symbols.
    expect(summary.prompt).toContain("./alpha.js");
    expect(summary.prompt).toContain("./beta.js");
    expect(summary.prompt).toContain("./gamma.js");
    expect(summary.prompt).toContain("foo");
    expect(summary.prompt).toContain("bar");
    expect(summary.prompt).toContain("baz");
    // No empty contract — the failure mode was provides=[] requires=[].
    expect(summary.provides!.length).toBeGreaterThan(0);
    expect(summary.requires!.length).toBeGreaterThan(0);
  });

  it("classify(declaration_only content) → buildStaticSummary populates provides with type names", () => {
    const filePath = "src/x/types.ts";
    const content = [
      `import type { Foo } from "./foo.js";`,
      ``,
      `export interface UserConfig { id: string }`,
      `export type OntologyNode = { id: string };`,
      `export type LlmTask = "a" | "b";`,
      ``,
    ].join("\n");
    const classification = classifySourceFile({ path: filePath, content });
    expect(classification.structuralShape).toBe("declaration_only");
    expect(classification.vocabulary).toBeDefined();

    const summary = buildStaticSummary({
      filePath,
      classification,
    });
    expect(summary.provides).toEqual([
      "UserConfig",
      "OntologyNode",
      "LlmTask",
    ]);
    // Post-Move-1b: imported symbol names, not module paths.
    expect(summary.requires).toEqual(["Foo"]);
    expect(summary.prompt).toContain("UserConfig");
    expect(summary.prompt).toContain("OntologyNode");
    expect(summary.prompt).toContain("LlmTask");
    expect(summary.prompt).toContain("Foo");
    expect(summary.provides!.length).toBeGreaterThan(0);
  });

  it("buildStaticSummary does not invent names — every provide/require comes from the source", () => {
    const filePath = "src/x/index.ts";
    const content = `export { realName } from "./real-module.js";\n`;
    const classification = classifySourceFile({ path: filePath, content });
    const summary = buildStaticSummary({ filePath, classification });
    // Only what's literally in the source surfaces. Post-Move-1b:
    // requires carries the imported symbol from the re-export's
    // implicit import (not the module path).
    expect(summary.provides).toEqual(["realName"]);
    expect(summary.requires).toEqual(["realName"]);
    // Nothing fictional shows up.
    expect(summary.provides).not.toContain("invented");
    expect(summary.requires).not.toContain("./invented.js");
    expect(summary.requires).not.toContain("invented");
  });
});

describe("β-self-ingest regression — large barrel doesn't blow up the prompt", () => {
  it("prompt truncates inline lists beyond 24 items with a count tail", () => {
    const exports = Array.from({ length: 32 }, (_, i) => ({
      name: `sym${i}`,
      kind: "value" as const,
      reExportedFrom: "./big.js",
    }));
    const imports = [
      {
        modulePath: "./big.js",
        kind: "value" as const,
        symbols: exports.map((e) => e.name),
      },
    ];
    const classification = fixtureClassification({
      path: "src/x/index.ts",
      shape: "barrel",
      vocabulary: { exports, imports },
    });
    const summary = buildStaticSummary({
      filePath: "src/x/index.ts",
      classification,
    });
    // All 32 names land in provides — no information loss.
    expect(summary.provides!.length).toBe(32);
    // The prompt's inline list of import-target symbols is bounded.
    expect(summary.prompt).toMatch(/and \d+ more/);
  });
});

// ── Move 1b regression — requires must carry symbol names ──────────────────
//
// Phase ε β′ (2026-05-16) revealed that buildStaticSummary emitted
// MODULE PATHS into `requires` while the gluing check expected
// SYMBOL NAMES. Result: six of seven static-summary deflected files
// moved from `divergent_*` to `unrecoverable` because the gluing
// check silently rejected every requires entry. Move 1b (Phase ε
// 2026-05-18) swapped the source from `i.modulePath` to
// `i.symbols.flatMap`. The tests below pin that contract.

describe("Move 1b — requires carries symbol names, never module paths", () => {
  it("barrel with named re-exports → requires is symbol names", () => {
    const classification = fixtureClassification({
      path: "src/runtime/effects/index.ts",
      shape: "barrel",
      vocabulary: {
        exports: [
          { name: "io", kind: "value", reExportedFrom: "./io.js" },
          { name: "result", kind: "value", reExportedFrom: "./result.js" },
        ],
        imports: [
          { modulePath: "./io.js", kind: "value", symbols: ["io"] },
          { modulePath: "./result.js", kind: "value", symbols: ["result"] },
        ],
      },
    });
    const summary = buildStaticSummary({
      filePath: "src/runtime/effects/index.ts",
      classification,
    });
    expect(summary.requires).toEqual(["io", "result"]);
    // None of the entries are module paths or end in a source extension.
    for (const req of summary.requires ?? []) {
      expect(req).not.toMatch(/^\.\.?\//);
      expect(req).not.toMatch(/\.(js|ts|tsx|jsx|mjs|cjs)$/);
    }
  });

  it("declaration_only with type imports → requires is imported type names", () => {
    const classification = fixtureClassification({
      path: "src/runtime/context/types.ts",
      shape: "declaration_only",
      vocabulary: {
        exports: [
          { name: "ContextRequirement", kind: "type" },
        ],
        imports: [
          {
            modulePath: "../../schemas/ontology.js",
            kind: "type",
            symbols: ["AbstractionLevel", "NodeKind"],
          },
        ],
      },
    });
    const summary = buildStaticSummary({
      filePath: "src/runtime/context/types.ts",
      classification,
    });
    expect(summary.requires).toEqual(["AbstractionLevel", "NodeKind"]);
    for (const req of summary.requires ?? []) {
      expect(req).not.toMatch(/^\.\.?\//);
      expect(req).not.toMatch(/\.(js|ts|tsx|jsx|mjs|cjs)$/);
    }
  });

  // §4.7 — Defensive regression. Even if some future refactor
  // re-introduces a code path that reaches for `i.modulePath`, this
  // sweep over diverse fixtures catches the leak.
  it("never emits a requires entry shaped like a module path (defensive)", () => {
    const fixtures: StructuralClassification[] = [
      fixtureClassification({
        path: "src/a/index.ts",
        shape: "barrel",
        vocabulary: {
          exports: [{ name: "x", kind: "value", reExportedFrom: "./x.ts" }],
          imports: [{ modulePath: "./x.ts", kind: "value", symbols: ["x"] }],
        },
      }),
      fixtureClassification({
        path: "src/b/types.tsx",
        shape: "declaration_only",
        vocabulary: {
          exports: [{ name: "T", kind: "type" }],
          imports: [
            { modulePath: "./x.tsx", kind: "type", symbols: ["X"] },
            { modulePath: "./y.jsx", kind: "type", symbols: ["Y"] },
          ],
        },
      }),
      fixtureClassification({
        path: "src/c/index.ts",
        shape: "barrel",
        vocabulary: {
          exports: [{ name: "a", kind: "value", reExportedFrom: "./mjs-mod.mjs" }],
          imports: [{ modulePath: "./mjs-mod.mjs", kind: "value", symbols: ["a"] }],
        },
      }),
    ];
    for (const classification of fixtures) {
      const summary = buildStaticSummary({
        filePath: classification.path,
        classification,
      });
      for (const req of summary.requires ?? []) {
        expect(req).not.toMatch(/^\.\.?\//);
        expect(req).not.toMatch(/\.(js|ts|tsx|jsx|mjs|cjs)$/);
      }
    }
  });
});

describe("buildStaticSummary — provideSignatures (O1)", () => {
  it("threads per-export signatures from vocabulary into provideSignatures, omitting un-signed exports", () => {
    const classification = fixtureClassification({
      path: "src/types.ts",
      shape: "declaration_only",
      role: "type_module",
      vocabulary: {
        exports: [
          { name: "Id", kind: "type", signature: "string | number" },
          { name: "Box", kind: "type", signature: "{ x: number }" },
          // No signature (e.g. inferred / unreadable) — must be absent.
          { name: "Bare", kind: "type" },
        ],
        imports: [],
      },
    });
    const summary = buildStaticSummary({
      filePath: "src/types.ts",
      classification,
    });
    // provides stays a bare name list.
    expect(summary.provides).toEqual(["Id", "Box", "Bare"]);
    // signatures ride parallel, only for exports that carry one.
    expect(summary.provideSignatures).toEqual({
      Id: "string | number",
      Box: "{ x: number }",
    });
  });

  it("omits provideSignatures entirely when no export carries a signature", () => {
    const classification = fixtureClassification({
      path: "src/types.ts",
      shape: "declaration_only",
      role: "type_module",
      vocabulary: {
        exports: [{ name: "Bare", kind: "type" }],
        imports: [],
      },
    });
    const summary = buildStaticSummary({
      filePath: "src/types.ts",
      classification,
    });
    expect(summary.provideSignatures).toBeUndefined();
  });
});
