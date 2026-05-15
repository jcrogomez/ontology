import * as path from "node:path";
import * as ts from "typescript";
import { parseTypeScriptFile, type ParsedTSFile } from "../static/typescript.js";

// Structural Semantic Classifier v0 — Ontology's first layer of
// structural perception over source code.
//
// Design principle (load-bearing):
//
//     Classifier produces facts.
//     Ingest policy consumes facts.
//
// This module does cheap, deterministic AST + filename inspection
// over a single source file and returns structured facts about it:
// what shape it has, what semantic role it likely plays, what static
// signals were detected, and why each conclusion was reached.
//
// What this module is NOT:
//   - It is not a "barrel skipper" or any other ingest optimisation.
//   - It does not decide what to dispatch to an LLM.
//   - It does not call any LLM. It does not perform any IO beyond
//     accepting `content` as a string. The caller reads the file.
//   - It is not wired into `onto ingest` in this PR. Consumers come
//     later as separate, reversible policy layers.
//
// What this module IS:
//   - A pure function from (path, content) to a typed classification
//     record that downstream policies (ingest, walker, verify,
//     translator) can read without re-parsing.
//   - The first concrete instance of structural perception as a
//     reusable core capability — predecessor to the path-based
//     frontier-tagger.ts but operating at a strictly deeper layer
//     (AST + module surface, not filename regex).

// ── Public types ───────────────────────────────────────────────────────────

export type SourceLanguage =
  | "typescript"
  | "tsx"
  | "javascript"
  | "jsx"
  | "json"
  | "markdown"
  | "unknown";

export type StructuralShape =
  | "barrel"
  | "declaration_only"
  | "executable_module"
  | "component_module"
  | "test_module"
  | "configuration_module"
  | "schema_module"
  | "adapter_module"
  | "cli_module"
  | "mixed_module"
  | "unknown";

export type SemanticRole =
  | "domain_model"
  | "runtime_policy"
  | "llm_adapter"
  | "command_surface"
  | "validation_schema"
  | "ui_surface"
  | "test_specification"
  | "configuration"
  | "module_boundary"
  | "utility"
  | "unknown";

export interface StaticSignals {
  hasDefaultExport?: boolean;
  hasNamedExports?: boolean;
  hasOnlyReExports?: boolean;
  hasImports?: boolean;
  hasTypeOnlyImports?: boolean;
  hasRuntimeDeclarations?: boolean;
  hasTypeDeclarations?: boolean;
  hasInterfaces?: boolean;
  hasFunctions?: boolean;
  hasClasses?: boolean;
  hasZodSchema?: boolean;
  hasVitest?: boolean;
  hasJsx?: boolean;
  hasReactComponent?: boolean;
  hasCliEntrypoint?: boolean;
  importCount?: number;
  exportCount?: number;
  reExportCount?: number;
  symbolCount?: number;
}

export interface StructuralClassification {
  path: string;
  language: SourceLanguage;
  structuralShape: StructuralShape;
  semanticRole: SemanticRole;
  confidence: number;
  reasons: string[];
  signals: StaticSignals;
}

// ── Language detection ─────────────────────────────────────────────────────

const KNOWN_CONFIG_BASENAMES = new Set([
  "package.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "vite.config.ts",
  "vitest.config.ts",
  "eslint.config.js",
  "eslint.config.mjs",
  ".eslintrc.json",
  ".eslintrc.cjs",
  "prettier.config.js",
  ".prettierrc.json",
  "rollup.config.ts",
  "rollup.config.js",
]);

function detectLanguage(filePath: string): SourceLanguage {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".mjs":
    case ".cjs":
    case ".js":
      return "javascript";
    case ".jsx":
      return "jsx";
    case ".json":
      return "json";
    case ".md":
    case ".markdown":
      return "markdown";
    default:
      return "unknown";
  }
}

function isParseableAsTS(language: SourceLanguage): boolean {
  return (
    language === "typescript" ||
    language === "tsx" ||
    language === "javascript" ||
    language === "jsx"
  );
}

function scriptKindFor(language: SourceLanguage): ts.ScriptKind {
  switch (language) {
    case "typescript":
      return ts.ScriptKind.TS;
    case "tsx":
      return ts.ScriptKind.TSX;
    case "javascript":
      return ts.ScriptKind.JS;
    case "jsx":
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.Unknown;
  }
}

// ── Test detection by path (orthogonal to AST) ─────────────────────────────

function pathLooksLikeTest(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  if (/\.(test|spec)\.[mc]?[jt]sx?$/.test(base)) return true;
  const norm = filePath.replace(/\\/g, "/");
  if (/(^|\/)__tests__\//.test(norm)) return true;
  if (/(^|\/)tests?\//.test(norm)) return true;
  return false;
}

// ── AST signal collection ──────────────────────────────────────────────────

interface AstWalkResult {
  hasInterfaces: boolean;
  hasTypeAliases: boolean;
  hasFunctions: boolean;
  hasClasses: boolean;
  hasJsx: boolean;
  hasRuntimeConsts: boolean;
  hasReactComponent: boolean;
  hasZodSchemaCall: boolean;
  hasVitestCall: boolean;
}

function walkAst(sourceFile: ts.SourceFile): AstWalkResult {
  const result: AstWalkResult = {
    hasInterfaces: false,
    hasTypeAliases: false,
    hasFunctions: false,
    hasClasses: false,
    hasJsx: false,
    hasRuntimeConsts: false,
    hasReactComponent: false,
    hasZodSchemaCall: false,
    hasVitestCall: false,
  };

  // First pass — top-level statements. A barrel must have ONLY re-export
  // statements at the top level, so we care about every statement here.
  for (const stmt of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      result.hasInterfaces = true;
      continue;
    }
    if (ts.isTypeAliasDeclaration(stmt)) {
      result.hasTypeAliases = true;
      continue;
    }
    if (ts.isFunctionDeclaration(stmt)) {
      // Ambient function (`declare function foo()`) is type-only.
      const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
      const hasDeclare = mods?.some(
        (m) => m.kind === ts.SyntaxKind.DeclareKeyword,
      );
      if (hasDeclare) continue;
      result.hasFunctions = true;
      continue;
    }
    if (ts.isClassDeclaration(stmt)) {
      const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
      const hasDeclare = mods?.some(
        (m) => m.kind === ts.SyntaxKind.DeclareKeyword,
      );
      if (hasDeclare) continue;
      result.hasClasses = true;
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
      const hasDeclare = mods?.some(
        (m) => m.kind === ts.SyntaxKind.DeclareKeyword,
      );
      if (hasDeclare) continue;
      result.hasRuntimeConsts = true;
    }
  }

  // Second pass — recursive walk to detect JSX, Zod calls, vitest
  // calls. These can be nested arbitrarily deep so we visit every
  // descendant.
  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      result.hasJsx = true;
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      // z.object / z.string / z.array / z.union / z.literal / z.enum
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "z"
      ) {
        result.hasZodSchemaCall = true;
      }
      // describe / it / test / expect (vitest API surface)
      if (ts.isIdentifier(callee)) {
        const name = callee.text;
        if (
          name === "describe" ||
          name === "it" ||
          name === "test" ||
          name === "expect"
        ) {
          result.hasVitestCall = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  // React component heuristic: exported function/const whose name
  // starts with an uppercase letter AND the file has JSX. Detection
  // is cheap and conservative — false negatives on lowercase
  // "components" (not a real pattern) are acceptable, false positives
  // require both JSX + an uppercase named export which is the React
  // convention.
  if (result.hasJsx) {
    for (const stmt of sourceFile.statements) {
      const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
      const isExported = mods?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );
      if (!isExported) continue;
      if (ts.isFunctionDeclaration(stmt) && stmt.name) {
        if (/^[A-Z]/.test(stmt.name.text)) {
          result.hasReactComponent = true;
          break;
        }
      }
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && /^[A-Z]/.test(decl.name.text)) {
            result.hasReactComponent = true;
            break;
          }
        }
        if (result.hasReactComponent) break;
      }
    }
  }

  return result;
}

// ── Signal aggregation ─────────────────────────────────────────────────────

function buildSignals(
  parsed: ParsedTSFile,
  ast: AstWalkResult,
): StaticSignals {
  const reExportCount = parsed.exports.filter((e) => e.reExportedFrom).length;
  const namedExportCount = parsed.exports.filter((e) => !e.isDefault).length;
  const hasDefaultExport = parsed.exports.some((e) => e.isDefault);
  const hasNamedExports = namedExportCount > 0;
  const hasOnlyReExports =
    parsed.exports.length > 0 &&
    reExportCount === parsed.exports.length &&
    !ast.hasFunctions &&
    !ast.hasClasses &&
    !ast.hasInterfaces &&
    !ast.hasTypeAliases &&
    !ast.hasRuntimeConsts;
  const hasTypeOnlyImports =
    parsed.imports.length > 0 &&
    parsed.imports.every((i) => i.kind === "type");
  const hasRuntimeDeclarations =
    ast.hasFunctions || ast.hasClasses || ast.hasRuntimeConsts;
  const hasTypeDeclarations = ast.hasInterfaces || ast.hasTypeAliases;
  const hasZodImport = parsed.imports.some(
    (i) =>
      i.modulePath === "zod" ||
      i.modulePath === "zod/v4" ||
      i.modulePath.startsWith("zod/"),
  );
  const hasZodSchema = hasZodImport && ast.hasZodSchemaCall;
  const hasVitestImport = parsed.imports.some(
    (i) => i.modulePath === "vitest" || i.modulePath.startsWith("vitest/"),
  );
  const hasVitest = hasVitestImport || ast.hasVitestCall;
  const hasReactImport = parsed.imports.some(
    (i) =>
      i.modulePath === "react" ||
      i.modulePath === "react-dom" ||
      i.modulePath.startsWith("react/"),
  );
  const hasReactComponent = ast.hasReactComponent || (ast.hasJsx && hasReactImport);
  const hasCommanderImport = parsed.imports.some(
    (i) => i.modulePath === "commander" || i.modulePath.startsWith("commander/"),
  );

  return {
    hasDefaultExport,
    hasNamedExports,
    hasOnlyReExports,
    hasImports: parsed.imports.length > 0,
    hasTypeOnlyImports,
    hasRuntimeDeclarations,
    hasTypeDeclarations,
    hasInterfaces: ast.hasInterfaces || undefined,
    hasFunctions: ast.hasFunctions || undefined,
    hasClasses: ast.hasClasses || undefined,
    hasZodSchema: hasZodSchema || undefined,
    hasVitest: hasVitest || undefined,
    hasJsx: ast.hasJsx || undefined,
    hasReactComponent: hasReactComponent || undefined,
    hasCliEntrypoint: hasCommanderImport || undefined,
    importCount: parsed.imports.length,
    exportCount: parsed.exports.length,
    reExportCount,
    symbolCount:
      parsed.exports.length +
      (ast.hasFunctions ? 1 : 0) +
      (ast.hasClasses ? 1 : 0) +
      (ast.hasInterfaces ? 1 : 0) +
      (ast.hasTypeAliases ? 1 : 0),
  };
}

// ── Rule pipeline ──────────────────────────────────────────────────────────

interface RuleVerdict {
  shape: StructuralShape;
  role: SemanticRole;
  confidence: number;
  reasons: string[];
}

/**
 * Apply classification rules in priority order. The first rule that
 * fires produces the verdict. Mixed / unknown is the fallback.
 *
 * Path-based heuristics (test, configuration) run BEFORE AST-based
 * rules because:
 *   - Test files routinely contain runtime declarations, JSX, and
 *     Zod calls — classifying them by AST alone would mislabel as
 *     executable / component / schema. The path is the canonical
 *     signal.
 *   - Configuration files routinely export a value via default
 *     export and would be classified as executable_module
 *     otherwise.
 */
function applyRules(args: {
  filePath: string;
  language: SourceLanguage;
  signals: StaticSignals;
}): RuleVerdict {
  const { filePath, language, signals } = args;
  const base = path.basename(filePath);

  // 1. Test — path-based
  if (pathLooksLikeTest(filePath)) {
    return {
      shape: "test_module",
      role: "test_specification",
      confidence: 0.95,
      reasons: [
        signals.hasVitest
          ? "filename or path indicates a test + vitest API used"
          : "filename or path indicates a test",
      ],
    };
  }

  // 2. Configuration — filename-based
  if (KNOWN_CONFIG_BASENAMES.has(base) || /^tsconfig\..*\.json$/.test(base)) {
    return {
      shape: "configuration_module",
      role: "configuration",
      confidence: 0.95,
      reasons: [`filename '${base}' is a recognised configuration file`],
    };
  }

  // JSON / Markdown / unknown languages — no AST to lean on.
  if (language === "json") {
    return {
      shape: "configuration_module",
      role: "configuration",
      confidence: 0.7,
      reasons: ["json file (no known config name)"],
    };
  }
  if (language === "markdown" || language === "unknown") {
    return {
      shape: "unknown",
      role: "unknown",
      confidence: 0.3,
      reasons: [`language '${language}' not analysable by v0`],
    };
  }

  // 3. Barrel — only re-exports, no runtime, no types
  if (signals.hasOnlyReExports) {
    return {
      shape: "barrel",
      role: "module_boundary",
      confidence: 0.95,
      reasons: [
        `only re-export statements (${signals.reExportCount} re-export(s))`,
        "no runtime declarations or local types",
      ],
    };
  }

  // 4. Declaration-only — types only, no runtime
  if (
    signals.hasTypeDeclarations &&
    !signals.hasRuntimeDeclarations &&
    signals.reExportCount !== signals.exportCount
  ) {
    const isLikelyDomain =
      /\b(types?|model|entity|domain)\b/i.test(base) ||
      /\b(types?|model|entity|domain)\b/i.test(filePath);
    return {
      shape: "declaration_only",
      role: isLikelyDomain ? "domain_model" : "utility",
      confidence: 0.85,
      reasons: [
        "interface or type-alias declarations only",
        "no runtime functions, classes, or const declarations",
      ],
    };
  }

  // 5. Schema — Zod imports + z.X(...) call
  if (signals.hasZodSchema) {
    return {
      shape: "schema_module",
      role: "validation_schema",
      confidence: 0.85,
      reasons: [
        "imports 'zod' and contains z.* call(s)",
      ],
    };
  }

  // 6. Component — JSX in source + React import OR uppercase
  // exported function returning JSX
  if (signals.hasReactComponent) {
    return {
      shape: "component_module",
      role: "ui_surface",
      confidence: 0.85,
      reasons: [
        "JSX present in source",
        signals.hasJsx
          ? "exported identifier with React-component naming convention"
          : "react import detected",
      ],
    };
  }
  if (signals.hasJsx && (language === "tsx" || language === "jsx")) {
    return {
      shape: "component_module",
      role: "ui_surface",
      confidence: 0.7,
      reasons: ["JSX present in source (tsx/jsx) without explicit react import"],
    };
  }

  // 7. CLI — commander import OR commands/ path + cli-like content
  const onCommandsPath = /(^|\/)src\/commands\//.test(filePath.replace(/\\/g, "/"));
  const isCliFile = base === "cli.ts" || base === "cli.js";
  if (signals.hasCliEntrypoint || isCliFile) {
    return {
      shape: "cli_module",
      role: "command_surface",
      confidence: 0.85,
      reasons: [
        signals.hasCliEntrypoint
          ? "imports 'commander'"
          : `filename '${base}' is a known CLI entrypoint`,
      ],
    };
  }
  if (onCommandsPath && signals.hasRuntimeDeclarations) {
    return {
      shape: "cli_module",
      role: "command_surface",
      confidence: 0.7,
      reasons: ["path under src/commands/", "runtime declarations present"],
    };
  }

  // 8. LLM adapter — path /llm/ + adapter-ish + provider-like imports
  const onLlmPath = /(^|\/)src\/runtime\/llm\//.test(
    filePath.replace(/\\/g, "/"),
  );
  const adapterInName = /adapter/i.test(base);
  if (onLlmPath && adapterInName) {
    return {
      shape: "adapter_module",
      role: "llm_adapter",
      confidence: 0.85,
      reasons: ["path under src/runtime/llm/", `filename '${base}' contains 'adapter'`],
    };
  }
  if (onLlmPath && signals.hasRuntimeDeclarations) {
    return {
      shape: "adapter_module",
      role: "llm_adapter",
      confidence: 0.65,
      reasons: ["path under src/runtime/llm/", "runtime declarations present"],
    };
  }

  // 9. Executable runtime module (default for non-empty files with
  // runtime content).
  if (signals.hasRuntimeDeclarations) {
    return {
      shape: "executable_module",
      role: "runtime_policy",
      confidence: 0.6,
      reasons: [
        "has runtime declarations (functions / classes / const)",
        "no other strong shape signal",
      ],
    };
  }

  // 10. Mixed / unknown fallback.
  // Mixed: at least two distinct surfaces but none dominant.
  const surfaces = [
    signals.hasRuntimeDeclarations,
    signals.hasTypeDeclarations,
    signals.hasJsx,
    signals.hasZodSchema,
  ].filter(Boolean).length;
  if (surfaces >= 2) {
    return {
      shape: "mixed_module",
      role: "unknown",
      confidence: 0.4,
      reasons: ["multiple surfaces present, no dominant shape"],
    };
  }
  return {
    shape: "unknown",
    role: "unknown",
    confidence: 0.3,
    reasons: ["no strong static signals"],
  };
}

// ── Public entry point ─────────────────────────────────────────────────────

/**
 * Classify a single source file into a structural shape + semantic
 * role with explicit reasons + signals. Pure: no IO, no LLM, no
 * network.
 *
 * Caller is responsible for reading the file and supplying both the
 * path (used for filename heuristics + language detection + path
 * tagging like `src/commands/`) and the content (parsed if the
 * language supports it).
 */
export function classifySourceFile(input: {
  path: string;
  content: string;
}): StructuralClassification {
  const filePath = input.path;
  const content = input.content;
  const language = detectLanguage(filePath);

  // Languages we can't parse — apply path-based rules only.
  if (!isParseableAsTS(language)) {
    const verdict = applyRules({ filePath, language, signals: {} });
    return {
      path: filePath,
      language,
      structuralShape: verdict.shape,
      semanticRole: verdict.role,
      confidence: verdict.confidence,
      reasons: verdict.reasons,
      signals: {},
    };
  }

  // Parse + walk. parseTypeScriptFile gives us imports/exports
  // surface; walkAst fills in the rest (runtime/type declarations,
  // JSX, Zod, vitest, React component shape).
  const parsed = parseTypeScriptFile(filePath, content);
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    scriptKindFor(language),
  );
  const ast = walkAst(sourceFile);
  const signals = buildSignals(parsed, ast);
  const verdict = applyRules({ filePath, language, signals });

  return {
    path: filePath,
    language,
    structuralShape: verdict.shape,
    semanticRole: verdict.role,
    confidence: verdict.confidence,
    reasons: verdict.reasons,
    signals,
  };
}
