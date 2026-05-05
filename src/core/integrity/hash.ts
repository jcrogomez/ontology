import { createHash } from "node:crypto";
import stringify from "fast-json-stable-stringify";
import type {
  PersistedRunInput,
  PersistedRunModel,
} from "../../schemas/ontology.js";
import type { ContextAssemblyOutput } from "../../runtime/context/types.js";

// Ontology invariant:
// Hashing must be strictly deterministic across environments to guarantee network validation.
// Stable hashes are the immune system of Ontology. They let validate detect manual edits outside the CLI mutation path.
export function hashObject(value: unknown): string {
  const json = stringify(value);
  return createHash("sha256").update(json).digest("hex");
}

// Failure mode:
// Hashing an object with its own hash string included results in recursively invalid signatures.
// The hash field must be removed before hashing. A value cannot certify itself.
export function removeIntegrityHash<T extends { integrity: { hash?: string } }>(value: T): T {
  const { integrity, ...rest } = value;
  const newIntegrity = { ...integrity };
  delete newIntegrity.hash;

  return {
    ...rest,
    integrity: newIntegrity,
  } as unknown as T;
}

// Run persistence hashing.
// Each helper returns a self-describing prefixed hash so the kind is recoverable from the value.
// See docs/RUN_PERSISTENCE.md.

export function hashPrompt(text: string): string {
  // Normalize line endings and trim outer whitespace so trivial editing differences
  // do not produce divergent hashes for the same intention.
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const digest = createHash("sha256").update(normalized).digest("hex");
  return `prompt:hash:${digest}`;
}

// The assembled context output is hashed via canonical JSON so re-running with the same
// graph state produces the same hash. Canonical JSON makes property order irrelevant.
export function hashContext(output: ContextAssemblyOutput): string {
  const json = stringify(output);
  const digest = createHash("sha256").update(json).digest("hex");
  return `ctx:hash:${digest}`;
}

// hashRun derives a deterministic identifier for a run from its inputs and model.
// Two structurally identical runs produce the same hash, which is the basis for the run id.
export function hashRun(input: PersistedRunInput, model: PersistedRunModel): string {
  const json = stringify({ input, model });
  const digest = createHash("sha256").update(json).digest("hex");
  return `run:hash:${digest}`;
}
