// Walker action: `:link-analysis` — runs the semantic linker against
// the focal node and surfaces the gluing matrix + edge suggestions in
// the InfoPanel.
//
// Why a default candidate. The CLI's `onto link <nodeId>` requires
// `--candidate` because semanticLink is by design a candidate-vs-context
// validation. The walker, however, is for navigation — prompting the
// user mid-flight for candidate text would be friction. We therefore
// default the candidate to `focal.prompt.raw`, which turns the action
// into the question *"does my own prompt satisfy my context contract?"*.
// That is a useful sanity check while authoring (it surfaces
// missing-requirement and forbidden-match clashes between the prompt
// and the surrounding presheaf), and the user can always run the CLI
// for a different candidate.

import { semanticLink, type SemanticLinkResult } from "../../../forward/context/semantic-linker.js";
import {
  suggestEdgeProposals,
  type EdgeSuggestion,
} from "../../../forward/context/edge-suggester.js";
import { loadEdges, loadNodeById, loadNodes } from "../../../kernel/core/project/load.js";
import type { OntologyNode } from "../../../kernel/schemas/ontology.js";

export interface LinkAnalysisRow {
  token: string;
  /** present in the gluing pool. */
  satisfied: boolean;
  /** node ids that provide the token, sorted. */
  providers: string[];
}

export interface LinkAnalysisForbidsRow {
  token: string;
  violated: boolean;
  violators: string[];
}

export interface LinkAnalysisFromWalkerResult {
  ok: boolean;
  // Populated when ok=false.
  message?: string;
  // Populated when ok=true.
  focalId?: string;
  focalLabel?: string;
  contextNodeIds?: string[];
  validation?: SemanticLinkResult["validation"];
  requires?: LinkAnalysisRow[];
  provides?: string[];
  forbids?: LinkAnalysisForbidsRow[];
  suggestions?: EdgeSuggestion[];
}

export async function linkAnalysisFromWalker(
  focalId: string,
  cwd?: string,
): Promise<LinkAnalysisFromWalkerResult> {
  const focal = loadNodeById(focalId, cwd);
  if (!focal) {
    return { ok: false, message: `node not found: ${focalId}` };
  }

  // Default candidate: the focal's own prompt. If the focal carries no
  // prompt body, fall back to a synthetic placeholder string so
  // semanticLink's empty-candidate check (which fires when
  // `text.trim().length === 0`) does not dominate the report. The
  // placeholder is a real string with non-whitespace content; the
  // gluing matrix and edge suggestions are independent of the candidate
  // text, so the placeholder does not bias them.
  const candidateText = focal.prompt.raw && focal.prompt.raw.trim().length > 0
    ? focal.prompt.raw
    : "(focal has no prompt body — analysing context contract only)";

  let result: SemanticLinkResult;
  try {
    result = await semanticLink({
      targetNodeId: focalId,
      candidate: { text: candidateText, provider: "mock", model: "manual" },
      ...(cwd && { cwd }),
    });
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  const requires = computeRequiresRows(result, focal);
  const forbids = computeForbidsRows(result, focal);
  const provides = focal.context.provides.map((p) => p.key).sort();

  let suggestions: EdgeSuggestion[] = [];
  const missing = requires.filter((r) => !r.satisfied).map((r) => r.token);
  if (missing.length > 0) {
    suggestions = suggestEdgeProposals({
      focalNode: focal,
      missingRequirements: missing,
      allNodes: loadNodes(cwd),
      existingEdges: loadEdges(cwd),
    });
  }

  return {
    ok: true,
    focalId,
    focalLabel: focal.label,
    contextNodeIds: result.contextNodeIds,
    validation: result.validation,
    requires,
    provides,
    forbids,
    suggestions,
  };
}

function computeRequiresRows(result: SemanticLinkResult, focal: OntologyNode): LinkAnalysisRow[] {
  const providersByToken = new Map<string, string[]>();
  for (const f of result.fragments) {
    for (const token of f.provides) {
      let bucket = providersByToken.get(token);
      if (!bucket) {
        bucket = [];
        providersByToken.set(token, bucket);
      }
      bucket.push(f.nodeId);
    }
  }
  const rows: LinkAnalysisRow[] = focal.context.requires.map((r) => ({
    token: r.source,
    providers: (providersByToken.get(r.source) ?? []).filter((id) => id !== focal.id).sort(),
    satisfied: false, // computed below
  }));
  for (const row of rows) row.satisfied = row.providers.length > 0;
  rows.sort((a, b) => {
    if (a.satisfied !== b.satisfied) return a.satisfied ? 1 : -1;
    return a.token < b.token ? -1 : a.token > b.token ? 1 : 0;
  });
  return rows;
}

function computeForbidsRows(result: SemanticLinkResult, focal: OntologyNode): LinkAnalysisForbidsRow[] {
  const providersByToken = new Map<string, string[]>();
  for (const f of result.fragments) {
    for (const token of f.provides) {
      let bucket = providersByToken.get(token);
      if (!bucket) {
        bucket = [];
        providersByToken.set(token, bucket);
      }
      bucket.push(f.nodeId);
    }
  }
  const rows: LinkAnalysisForbidsRow[] = focal.context.forbids.map((f) => ({
    token: f.source,
    violators: (providersByToken.get(f.source) ?? []).sort(),
    violated: false,
  }));
  for (const row of rows) row.violated = row.violators.length > 0;
  rows.sort((a, b) => {
    if (a.violated !== b.violated) return a.violated ? -1 : 1;
    return a.token < b.token ? -1 : a.token > b.token ? 1 : 0;
  });
  return rows;
}
