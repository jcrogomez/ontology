import { createHash } from "node:crypto";
import stringify from "fast-json-stable-stringify";

// Upstream-context plumbing for compile-node.
//
// Axiom 7 (refinement, inductive form): a node's compilation should be done in
// the context of its DIRECT refinement parents' compiled outputs. Transitively,
// the parents themselves were compiled in the context of THEIR parents, so the
// chain's lineage is honored without smuggling everything into a single
// system prompt.
//
// Axiom 3 (presheaf): context is local. The compile-time view of a node is
// its refinement neighborhood, not the full topological closure.
//
// Axiom 9 (provenance): different upstream contexts must produce different
// run ids. The contextHash defined here is the slot in PersistedRunInput
// that turns the run cache into a faithful function of (prompt, upstreams,
// model).
//
// Mock identity contract (axiom 6 trivial case): the mock adapter's
// `code_sketch` returns `request.prompt` verbatim and ignores `request.system`.
// Threading upstreams as system therefore CANNOT change the mock's artifact —
// the cache key changes (because contextHash changes), but the bytes do not.
// Tests assert this end-to-end.

export interface UpstreamContextItem {
  // The id of the upstream refinement parent.
  nodeId: string;
  // The level token (canon, project, target, ...). Used purely as a label in
  // the system prompt to help the model — not load-bearing semantically.
  level?: string;
  // The full text of that parent's compiled artifact (the dispatcher's raw
  // response.text, NOT the post-fence-extraction projection — what the parent
  // produced semantically, before disk projection).
  text: string;
}

// Build the system-prompt string injected into the dispatcher request.
// Returns null when there are no upstreams — callers should pass undefined
// `system` in that case so cache keys for upstream-less compiles stay
// indistinguishable from pre-threading runs (no spurious contextHash).
//
// Format choice: XML-style <context source=... level=...>...</context> tags.
// The earlier draft of this helper used `[<id> :: <level>]` bracket headers.
// On small models (e.g. llama3.2:3b) those headers leaked verbatim into
// generated artifacts — the model pattern-matched the bracket format in
// the system prompt and emitted similar-looking text instead of the code
// it was supposed to produce. XML angle brackets are structurally distinct
// from any code pattern the model would naturally emit, so the mimicry
// vector is closed. The hash (`hashUpstreamContext`) is independent of
// the visible format, so this change does not invalidate any existing
// run cache; the contextHash for a given (nodeId, text) tuple is stable.
export function buildUpstreamSystemPrompt(upstream: UpstreamContextItem[]): string | null {
  if (upstream.length === 0) return null;
  const sections = upstream.map((u) => {
    const attrs = u.level
      ? `source="${u.nodeId}" level="${u.level}"`
      : `source="${u.nodeId}"`;
    return `<context ${attrs}>\n${u.text}\n</context>`;
  });
  return [
    "You are compiling one node of an Ontology semantic graph. The upstream refinement parents listed below have already been compiled. Treat their outputs as context; your output should be consistent with what they expressed without restating it. Do NOT echo the <context> tags or their attributes in your response — they are framing for you, not content to produce.",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

// Hash the upstream context into the `ctx:hash:` namespace. Stable JSON over
// the ordered list — same upstreams in same order produce the same hash;
// reorder or change a body and the hash diverges.
//
// Returns null when there are no upstreams, mirroring the system-prompt
// helper. PersistedRunInput.contextHash accepts null (the schema's default).
export function hashUpstreamContext(upstream: UpstreamContextItem[]): string | null {
  if (upstream.length === 0) return null;
  const canonical = upstream.map((u) => ({ nodeId: u.nodeId, text: u.text }));
  const digest = createHash("sha256").update(stringify(canonical)).digest("hex");
  return `ctx:hash:${digest}`;
}
