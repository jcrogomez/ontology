import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  AbstractionLevelSchema,
  ManifestationSchema,
  NodeKindSchema,
} from "../src/schemas/ontology.js";
import { buildStaticSummary } from "../src/runtime/legend/static-summary.js";
import { decideStaticClassifierIngestAction } from "../src/commands/ingest/static-classifier-policy.js";
import type {
  StructuralClassification,
  StructuralShape,
  SemanticRole,
} from "../src/runtime/legend/structural-classifier.js";

// Mirror of ExtractionResultSchema from src/commands/ingest/index.ts.
// Imported separately here (rather than from the commands module) to
// keep the unit test free of CLI coupling — the contract under test
// is that buildStaticSummary outputs validate against the same Zod
// shape the proposal layer enforces.
const ExtractionResultSchema = z.object({
  label: z.string().min(1).max(256),
  level: AbstractionLevelSchema,
  kind: NodeKindSchema,
  manifestation: ManifestationSchema.optional(),
  language: z.string().optional(),
  prompt: z.string().min(1),
  requires: z.array(z.string()).optional(),
  provides: z.array(z.string()).optional(),
  forbids: z.array(z.string()).optional(),
  rules: z.array(z.string()).optional(),
});

// Helper to construct a StructuralClassification with sensible defaults
// for the fields the builder doesn't read (path, reasons, signals).
function fixtureClassification(args: {
  path?: string;
  shape: StructuralShape;
  role?: SemanticRole;
  reExportCount?: number;
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
  };
}

describe("buildStaticSummary — barrel", () => {
  it("produces a valid ExtractionResult for a barrel", () => {
    const classification = fixtureClassification({
      path: "src/runtime/effects/index.ts",
      shape: "barrel",
      role: "module_boundary",
      reExportCount: 12,
    });
    const summary = buildStaticSummary({
      filePath: "src/runtime/effects/index.ts",
      classification,
    });
    const parsed = ExtractionResultSchema.safeParse(summary);
    expect(parsed.success).toBe(true);
  });

  it("labels with the basename and includes the re-export count in the prompt", () => {
    const classification = fixtureClassification({
      path: "src/runtime/effects/index.ts",
      shape: "barrel",
      reExportCount: 12,
    });
    const summary = buildStaticSummary({
      filePath: "src/runtime/effects/index.ts",
      classification,
    });
    expect(summary.label).toContain("index.ts");
    expect(summary.label.toLowerCase()).toContain("barrel");
    expect(summary.prompt).toContain("12 re-exports");
    // Pluralisation: 12 re-exports (with the 's').
    expect(summary.prompt).not.toContain("12 re-export ");
  });

  it("singular pluralisation when exactly one re-export", () => {
    const classification = fixtureClassification({
      shape: "barrel",
      reExportCount: 1,
    });
    const summary = buildStaticSummary({
      filePath: "src/x/index.ts",
      classification,
    });
    expect(summary.prompt).toContain("1 re-export,");
    expect(summary.prompt).not.toContain("1 re-exports");
  });

  it("uses kind=artifact, level=artifact, manifestation=code", () => {
    const classification = fixtureClassification({
      shape: "barrel",
      reExportCount: 3,
    });
    const summary = buildStaticSummary({
      filePath: "src/x/index.ts",
      classification,
    });
    expect(summary.kind).toBe("artifact");
    expect(summary.level).toBe("artifact");
    expect(summary.manifestation).toBe("code");
  });
});

describe("buildStaticSummary — declaration_only", () => {
  it("produces a valid ExtractionResult for a declaration-only module", () => {
    const classification = fixtureClassification({
      path: "src/runtime/context/types.ts",
      shape: "declaration_only",
      role: "domain_model",
    });
    const summary = buildStaticSummary({
      filePath: "src/runtime/context/types.ts",
      classification,
    });
    const parsed = ExtractionResultSchema.safeParse(summary);
    expect(parsed.success).toBe(true);
  });

  it("uses kind=definition", () => {
    const classification = fixtureClassification({
      shape: "declaration_only",
      role: "domain_model",
    });
    const summary = buildStaticSummary({
      filePath: "src/types.ts",
      classification,
    });
    expect(summary.kind).toBe("definition");
    expect(summary.label.toLowerCase()).toContain("types");
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
