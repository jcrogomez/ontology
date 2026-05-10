import { assembleContext } from "./assembler.js";
import { buildFragment, type ContextFragment } from "./presheaf.js";
import { glueFragments, type GluingConflict } from "./gluing.js";
import { validateIntent } from "./intent-validator.js";
import { OntologyRuntimeError } from "../errors.js";
import { LlmProviderSchema, type OntologyEdge } from "../../schemas/ontology.js";

// Semantic linker: the programmatic counterpart to `run context --validate`.
// Walks the focal node's local neighborhood, glues the presheaf fragments,
// and validates a candidate response against the result.
//
// Edge-awareness (this PR): when `includeEdges` is true the assembler also
// projects typed edges incident to the focal node and its ancestors, bringing
// neighbor nodes into the gluing pipeline. A focal `requires` can now be
// satisfied by an edge neighbor's `provides`, and an edge neighbor's text
// can trigger a focal `FORBID:` constraint.
//
// `edgeTypes` narrows which edge types contribute. Behaviour matches
// `context assemble --include-edges --edge-types <list>` exactly.

export interface SemanticLinkInput {
  targetNodeId: string;
  branch?: string;
  mode?: "strict";
  candidate: {
    text: string;
    provider: string;
    model: string;
  };
  cwd?: string;
  // Edge-aware extension. Defaults to false to preserve the existing contract
  // for callers that walked only the parent path.
  includeEdges?: boolean;
  edgeTypes?: OntologyEdge["type"][];
}

export interface SemanticLinkResult {
  ok: boolean;
  contextNodeIds: string[];
  conflicts: GluingConflict[];
  validation: {
    ok: boolean;
    score: number;
    violations: string[];
    warnings: string[];
  };
  // The presheaf fragments that fed gluing, in the same order as
  // `contextNodeIds`. Exposed so callers (notably `onto link`) can
  // build a per-token requires/provides/forbids matrix without
  // re-loading and re-fragmenting the context. Pure data; cheap to
  // include.
  fragments: ContextFragment[];
  // Populated only when includeEdges was true. Carries the edges that
  // contributed to the gluing and the neighbor node ids brought in via
  // those edges. Callers that need to surface "which edges informed this
  // validation" use this.
  edgeContext?: {
    edges: OntologyEdge[];
    nodeIds: string[];
  };
}

export async function semanticLink(input: SemanticLinkInput): Promise<SemanticLinkResult> {
  const mode = input.mode || "strict";

  if (mode !== "strict") {
    throw new OntologyRuntimeError(`Unsupported semantic link mode: ${mode}`, {
      code: "UNSUPPORTED_MODE",
      details: { mode }
    });
  }

  const cwd = input.cwd || process.cwd();
  const includeEdges = !!input.includeEdges;

  const assembled = assembleContext({
    targetNodeId: input.targetNodeId,
    branch: input.branch,
    mode: "strict",
    includeEdges,
    edgeTypes: input.edgeTypes,
  }, cwd);

  const fragments = assembled.nodes.map(node => buildFragment(node));
  const glued = glueFragments(fragments);

  // Parse the provider through Zod so a typo or stray string fails loudly
  // rather than silently passing as `any` to the validator. The provider is
  // part of the candidate's identity; treating it as untyped erases that.
  const providerResult = LlmProviderSchema.safeParse(input.candidate.provider);
  if (!providerResult.success) {
    throw new OntologyRuntimeError(
      `Unsupported candidate provider: ${input.candidate.provider}`,
      {
        code: "UNSUPPORTED_PROVIDER",
        details: { provider: input.candidate.provider },
      },
    );
  }

  const validation = validateIntent({
    assembled,
    glued,
    candidate: {
      text: input.candidate.text,
      provider: providerResult.data,
      model: input.candidate.model
    }
  });

  const ok = glued.ok && validation.ok;

  const result: SemanticLinkResult = {
    ok,
    contextNodeIds: assembled.nodes.map(node => node.id),
    conflicts: glued.conflicts,
    validation,
    fragments,
  };

  if (assembled.edgeContext) {
    result.edgeContext = assembled.edgeContext;
  }

  return result;
}
