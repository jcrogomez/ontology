import { assembleContext } from "./assembler.js";
import { buildFragment } from "./presheaf.js";
import { glueFragments } from "./gluing.js";
import { validateIntent } from "./intent-validator.js";
import { OntologyRuntimeError } from "../errors.js";

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
}

export interface SemanticLinkResult {
  ok: boolean;
  contextNodeIds: string[];
  conflicts: unknown[];
  validation: {
    ok: boolean;
    score: number;
    violations: string[];
    warnings: string[];
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

  const assembled = assembleContext({
    targetNodeId: input.targetNodeId,
    branch: input.branch,
    mode: "strict"
  }, cwd);

  const fragments = assembled.nodes.map(node => buildFragment(node));
  const glued = glueFragments(fragments);

  const validation = validateIntent({
    assembled,
    glued,
    candidate: {
      text: input.candidate.text,
      // Need to cast to match the LlmProvider type expected by IntentValidationInput
      provider: input.candidate.provider as any,
      model: input.candidate.model
    }
  });

  const ok = glued.ok && validation.ok;

  return {
    ok,
    contextNodeIds: assembled.nodes.map(node => node.id),
    conflicts: glued.conflicts,
    validation
  };
}
