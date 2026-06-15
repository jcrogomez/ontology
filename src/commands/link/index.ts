// `onto link <nodeId>` — CLI surface for the semantic linker.
//
// Wraps `semanticLink()` (which itself wraps assembleContext + glueFragments
// + validateIntent) and renders the result as a single auditable card. The
// candidate text is required (--candidate <text> | --candidate-file <path>)
// because semanticLink validates a candidate response against the focal's
// presheaf — without one there is no validation to report. For an
// inspection-only flow inside the walker, see `:link-analysis`, which
// defaults the candidate to `focal.prompt.raw`.
//
// Read-only by design. The command never mutates `.ontology/`, never
// dispatches a model, and never creates proposals. Edge suggestions are
// printed as copy-pasteable `onto propose link …` commands; the user is
// the agent who decides to act.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  semanticLink,
  type SemanticLinkResult,
} from "../../forward/context/semantic-linker.js";
import {
  suggestEdgeProposals,
  type EdgeSuggestion,
} from "../../forward/context/edge-suggester.js";
import { loadEdges, loadNodeById, loadNodes, loadState } from "../../kernel/core/project/load.js";
import { EdgeTypeSchema, type OntologyEdge } from "../../kernel/schemas/ontology.js";
import { errorMessage } from "../../kernel/core/errors.js";
import { box, kvLines } from "../../kernel/core/render/box.js";
import { bold, color, dim } from "../../kernel/core/render/style.js";

export interface LinkCommandOptions {
  candidate?: string;
  candidateFile?: string;
  branch?: string;
  includeEdges?: boolean;
  edgeTypes?: string;
  // Commander turns `--no-suggest-edges` into the field `suggestEdges: false`
  // (the literal flag does NOT become `noSuggestEdges`). Default is true.
  suggestEdges?: boolean;
  json?: boolean;
}

interface RequirementRow {
  token: string;
  satisfied: boolean;
  providers: string[];
}

interface ForbidsRow {
  token: string;
  violated: boolean;
  violators: string[];
}

interface NeighborRow {
  nodeId: string;
  // "out" — focal → neighbor; "in" — neighbor → focal.
  direction: "out" | "in";
  edgeType: string;
}

export async function linkCommand(focalId: string, options: LinkCommandOptions): Promise<void> {
  const isJson = !!options.json;

  // ── Resolve candidate text ────────────────────────────────────────────
  // Exactly one of --candidate / --candidate-file is required. The
  // mutual-exclusion check catches the (rare) case where both are
  // provided; the missing-input check is the common error and gets a
  // hint pointing at both alternatives.
  if (options.candidate && options.candidateFile) {
    fail(`--candidate and --candidate-file are mutually exclusive`, isJson);
    return;
  }
  let candidateText: string;
  if (options.candidate !== undefined) {
    candidateText = options.candidate;
  } else if (options.candidateFile) {
    try {
      candidateText = fs.readFileSync(path.resolve(options.candidateFile), "utf8");
    } catch (err: unknown) {
      fail(`Failed to read --candidate-file: ${errorMessage(err)}`, isJson);
      return;
    }
    // Binary-content guard. fs.readFileSync(..., "utf8") does not throw on
    // binary input — it silently returns a string of garbled bytes plus
    // U+FFFD replacements, which the semantic linker would then try to
    // analyse as prose. A NUL byte is a high-precision signal of binary
    // content (legitimate UTF-8 text essentially never contains U+0000),
    // so surface an actionable error before any LLM work is wasted.
    if (candidateText.includes("\u0000")) {
      fail(
        `--candidate-file must be a readable UTF-8 text file — ${options.candidateFile} contains binary data.`,
        isJson,
      );
      return;
    }
  } else {
    fail(
      `onto link requires a candidate. Pass --candidate "<text>" or --candidate-file <path>.`,
      isJson,
    );
    return;
  }

  // ── Validate edge-types up front (matches `run context` style) ────────
  let parsedEdgeTypes: OntologyEdge["type"][] | undefined;
  if (options.edgeTypes) {
    const list = options.edgeTypes.split(",").map((s) => s.trim()).filter(Boolean);
    for (const t of list) {
      const r = EdgeTypeSchema.safeParse(t);
      if (!r.success) {
        fail(`Invalid edge type: ${t}`, isJson);
        return;
      }
    }
    parsedEdgeTypes = list as OntologyEdge["type"][];
  }

  // ── Load focal + run the linker ───────────────────────────────────────
  const focal = loadNodeById(focalId);
  if (!focal) {
    fail(`Node not found: ${focalId}`, isJson);
    return;
  }

  let linkResult: SemanticLinkResult;
  try {
    linkResult = await semanticLink({
      targetNodeId: focalId,
      candidate: {
        text: candidateText,
        // The semantic-linker requires a parsable provider for attribution.
        // The candidate text is supplied directly here (no dispatch), so
        // "mock" is the honest label: the response is a manual artifact,
        // not a model output.
        provider: "mock",
        model: "manual",
      },
      ...(options.branch && { branch: options.branch }),
      ...(options.includeEdges && { includeEdges: true }),
      ...(parsedEdgeTypes && { edgeTypes: parsedEdgeTypes }),
    });
  } catch (err: unknown) {
    fail(`Semantic link failed: ${errorMessage(err)}`, isJson);
    return;
  }

  // ── Compute per-token matrix from the fragments + focal declarations ──
  const requirementsRows = computeRequirementRows(linkResult, focal.context.requires.map((r) => r.source));
  const providesRows = focal.context.provides.map((p) => p.key).sort();
  const forbidsRows = computeForbidsRows(linkResult, focal.context.forbids.map((f) => f.source));
  const neighborRows = computeNeighborRows(focalId, parsedEdgeTypes);

  // ── Edge proposal suggestions for the unsatisfied requirements ────────
  // Commander's `--no-suggest-edges` produces `options.suggestEdges === false`;
  // when the flag is absent the field is `undefined`, which we treat as "on".
  let suggestions: EdgeSuggestion[] = [];
  if (options.suggestEdges !== false) {
    const missing = requirementsRows.filter((r) => !r.satisfied).map((r) => r.token);
    if (missing.length > 0) {
      const allNodes = loadNodes();
      const allEdges = loadEdges();
      suggestions = suggestEdgeProposals({
        focalNode: focal,
        missingRequirements: missing,
        allNodes,
        existingEdges: allEdges,
        ...(options.branch && { branch: options.branch }),
      });
    }
  }

  if (isJson) {
    const state = loadState();
    console.log(JSON.stringify(
      {
        ok: linkResult.ok,
        focal: focalId,
        branch: options.branch ?? state.activeBranch,
        contextNodeIds: linkResult.contextNodeIds,
        validation: linkResult.validation,
        requires: requirementsRows,
        provides: providesRows.map((token) => ({ token })),
        forbids: forbidsRows,
        neighbors: neighborRows,
        conflicts: linkResult.conflicts,
        ...(linkResult.edgeContext && { edgeContext: linkResult.edgeContext }),
        suggestions: suggestions.map((s) => ({
          ...s,
          command: proposeLinkCommandFor(s),
        })),
      },
      null,
      2,
    ));
    return;
  }

  renderHumanOutput({
    focalId,
    focalLabel: focal.label,
    abstraction: focal.coordinates.abstraction,
    branch: options.branch ?? loadState().activeBranch,
    linkResult,
    requirementsRows,
    providesRows,
    forbidsRows,
    neighborRows,
    suggestions,
  });
}

// ── Per-token matrix helpers ────────────────────────────────────────────

function computeRequirementRows(linkResult: SemanticLinkResult, focalRequires: string[]): RequirementRow[] {
  // "Provided in scope" means: at least one fragment in the gluing pool
  // has the token in its `provides`. We deliberately do NOT include the
  // focal's own provides — a node satisfying its own requirement via its
  // own provides would be circular and the linker (correctly) treats it
  // as missing.
  const providersByToken = new Map<string, string[]>();
  for (const f of linkResult.fragments) {
    for (const token of f.provides) {
      let bucket = providersByToken.get(token);
      if (!bucket) {
        bucket = [];
        providersByToken.set(token, bucket);
      }
      bucket.push(f.nodeId);
    }
  }
  const rows: RequirementRow[] = [];
  for (const token of focalRequires) {
    const providers = (providersByToken.get(token) ?? []).filter((id) => id !== "focal");
    rows.push({
      token,
      satisfied: providers.length > 0,
      providers: providers.sort(),
    });
  }
  // Sort missing-first, then by token name — surfaces what the user
  // probably came here to fix at the top of the table.
  rows.sort((a, b) => {
    if (a.satisfied !== b.satisfied) return a.satisfied ? 1 : -1;
    return a.token < b.token ? -1 : a.token > b.token ? 1 : 0;
  });
  return rows;
}

function computeForbidsRows(linkResult: SemanticLinkResult, focalForbids: string[]): ForbidsRow[] {
  const providersByToken = new Map<string, string[]>();
  for (const f of linkResult.fragments) {
    for (const token of f.provides) {
      let bucket = providersByToken.get(token);
      if (!bucket) {
        bucket = [];
        providersByToken.set(token, bucket);
      }
      bucket.push(f.nodeId);
    }
  }
  const rows: ForbidsRow[] = [];
  for (const token of focalForbids) {
    const violators = providersByToken.get(token) ?? [];
    rows.push({
      token,
      violated: violators.length > 0,
      violators: violators.sort(),
    });
  }
  rows.sort((a, b) => {
    if (a.violated !== b.violated) return a.violated ? -1 : 1;
    return a.token < b.token ? -1 : a.token > b.token ? 1 : 0;
  });
  return rows;
}

function computeNeighborRows(focalId: string, edgeTypeFilter?: OntologyEdge["type"][]): NeighborRow[] {
  // Direct one-hop neighbors only. The CLI already exposes deeper traversal
  // via `onto graph subgraph`; surfacing it here would duplicate that surface.
  const edges = loadEdges();
  const allowedTypes = edgeTypeFilter ? new Set(edgeTypeFilter) : null;
  const rows: NeighborRow[] = [];
  for (const e of edges) {
    if (allowedTypes && !allowedTypes.has(e.type)) continue;
    if (e.from === focalId) {
      rows.push({ nodeId: e.to, direction: "out", edgeType: e.type });
    } else if (e.to === focalId) {
      rows.push({ nodeId: e.from, direction: "in", edgeType: e.type });
    }
  }
  rows.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === "out" ? -1 : 1;
    if (a.edgeType !== b.edgeType) return a.edgeType < b.edgeType ? -1 : 1;
    return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
  });
  return rows;
}

// ── Human renderer ──────────────────────────────────────────────────────

interface HumanRenderInput {
  focalId: string;
  focalLabel: string;
  abstraction: string;
  branch: string;
  linkResult: SemanticLinkResult;
  requirementsRows: RequirementRow[];
  providesRows: string[];
  forbidsRows: ForbidsRow[];
  neighborRows: NeighborRow[];
  suggestions: EdgeSuggestion[];
}

function renderHumanOutput(input: HumanRenderInput): void {
  const { linkResult } = input;
  const v = linkResult.validation;

  const summary = kvLines([
    ["Focal",   `${input.focalId}  ${dim(input.focalLabel || "(no label)")}`],
    ["Branch",  color(input.branch, "cyan")],
    ["Status",  linkResult.ok ? color("✔ ok", "green") : color("✖ failed", "red")],
    ["Context", dim(`${linkResult.contextNodeIds.length} node(s) in scope`)],
  ]);

  const validationPairs: [string, string][] = [
    ["OK",         v.ok ? color("yes", "green") : color("no", "red")],
    ["Score",      String(v.score)],
    ["Violations", v.violations.length === 0 ? dim("0") : color(String(v.violations.length), "red")],
    ["Warnings",   v.warnings.length === 0 ? dim("0") : color(String(v.warnings.length), "yellow")],
  ];
  const validationLines = [bold("Validation"), ...kvLines(validationPairs).map((l) => `  ${l}`)];
  if (v.violations.length > 0) {
    validationLines.push(dim("  violations:"));
    for (const violation of v.violations.slice(0, 6)) {
      validationLines.push(`    • ${violation}`);
    }
    if (v.violations.length > 6) {
      validationLines.push(dim(`    …and ${v.violations.length - 6} more`));
    }
  }
  if (v.warnings.length > 0) {
    validationLines.push(dim("  warnings:"));
    for (const warning of v.warnings.slice(0, 6)) {
      validationLines.push(`    • ${warning}`);
    }
    if (v.warnings.length > 6) {
      validationLines.push(dim(`    …and ${v.warnings.length - 6} more`));
    }
  }

  const requiresLines: string[] = [
    bold(`Requires (${input.requirementsRows.length})`),
  ];
  if (input.requirementsRows.length === 0) {
    requiresLines.push(dim("  (focal declares no requires)"));
  } else {
    for (const row of input.requirementsRows) {
      const glyph = row.satisfied ? color("✓", "green") : color("✖", "red");
      const provenance = row.satisfied
        ? dim(`← ${row.providers.join(", ")}`)
        : dim("(no provider in scope)");
      requiresLines.push(`  ${glyph} ${row.token.padEnd(28)} ${provenance}`);
    }
  }

  const providesLines: string[] = [
    bold(`Provides (${input.providesRows.length})`),
  ];
  if (input.providesRows.length === 0) {
    providesLines.push(dim("  (focal declares no provides)"));
  } else {
    for (const token of input.providesRows) {
      providesLines.push(`  ${color("→", "cyan")} ${token}`);
    }
  }

  const forbidsLines: string[] = [
    bold(`Forbids (${input.forbidsRows.length})`),
  ];
  if (input.forbidsRows.length === 0) {
    forbidsLines.push(dim("  (focal declares no forbids)"));
  } else {
    for (const row of input.forbidsRows) {
      const glyph = row.violated ? color("✖", "red") : color("✓", "green");
      const detail = row.violated
        ? color(`provided by ${row.violators.join(", ")} — VIOLATION`, "red")
        : dim("not provided in scope");
      forbidsLines.push(`  ${glyph} ${row.token.padEnd(28)} ${detail}`);
    }
  }

  const neighborLines: string[] = [
    bold(`Relevant Neighbors (${input.neighborRows.length})`),
  ];
  if (input.neighborRows.length === 0) {
    neighborLines.push(dim("  (focal has no incident edges matching the filter)"));
  } else {
    for (const n of input.neighborRows.slice(0, 12)) {
      const arrow = n.direction === "out" ? color("→", "cyan") : color("←", "magenta");
      neighborLines.push(`  ${arrow} ${n.edgeType.padEnd(20)} ${n.nodeId}`);
    }
    if (input.neighborRows.length > 12) {
      neighborLines.push(dim(`  …and ${input.neighborRows.length - 12} more`));
    }
  }

  const sections: (string | null)[] = [
    ...summary,
    null,
    ...validationLines,
    null,
    ...requiresLines,
    null,
    ...providesLines,
    null,
    ...forbidsLines,
    null,
    ...neighborLines,
  ];

  if (input.suggestions.length > 0) {
    const suggestionLines: string[] = [
      bold(`Suggested edge proposals (${input.suggestions.length})`),
      dim("  No graph mutation. Run the listed commands to stage proposals."),
    ];
    for (const s of input.suggestions) {
      suggestionLines.push("");
      suggestionLines.push(
        `  ${color("•", "yellow")} ${color(s.type, "yellow")} → ${s.to}  ${dim(`(satisfies ${s.satisfies.join(", ")})`)}`,
      );
      suggestionLines.push(`      ${proposeLinkCommandFor(s)}`);
    }
    sections.push(null, ...suggestionLines);
  } else if (input.requirementsRows.some((r) => !r.satisfied)) {
    sections.push(null, dim("No edge suggestions found in the current branch."));
  }

  const titleStatus = linkResult.ok ? color("✔", "green") : color("✖", "red");
  console.log(
    box(sections, {
      title: bold(`LINK  ${input.focalId}  ${titleStatus}`),
      footer: dim(`${input.abstraction} · ${input.branch}`),
    }),
  );
}

function proposeLinkCommandFor(s: EdgeSuggestion): string {
  // The rationale embeds spaces, so the user can copy this verbatim and
  // the trailing words will be eaten by `propose link --rationale` (the
  // CLI's existing "rationale gobbles to EOL" behaviour). Quoting the
  // rationale is harmless and makes the command robust to shells that
  // would otherwise split on whitespace.
  const rationale = `satisfies ${s.satisfies.join(", ")}`;
  return `onto propose link --from ${s.from} --to ${s.to} --type ${s.type} --rationale "${rationale}"`;
}

// ── Failure helper ──────────────────────────────────────────────────────

function fail(msg: string, isJson: boolean): never {
  if (isJson) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
