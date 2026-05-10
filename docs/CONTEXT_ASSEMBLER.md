# Context Assembler

## Purpose

The Context Assembler solves the problem of deterministic, localized prompt assembly for the LLM. In an intention network, where the canon of knowledge and structure is distributed across a typed, temporal, directed graph, a model cannot simply be fed the entire network or a random subset. The Context Assembler acts as the rigid, deterministic lens that computes the precise sub-graph (presheaf) required to expand a specific node. It gathers context by walking the graph based strictly on explicit topological rules.

*Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction, where prompts act as rewrite rules that expand subgraphs, context is assigned locally as a presheaf over graph neighborhoods, and compilation is a structure-preserving functor from the category of intention to the category of executable artifacts.*

As of Bootstrap 0.9 (post-validator-port): deterministic context
assembly, edge-aware projection, presheaf gluing, and intent
validation (built on the topos predicate algebra) are all in place.
PromptAST recognises three line-anchored markers and emits a
deduplicated AST consumed by `compileNode` — but no module yet
rewrites the body based on the markers (axiom 4 is structural, not
yet a rewrite system; see
[`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §2.4). The
compiler ships and produces auditable artifacts. The semantic linker
is a programmatic API; an `onto link <id>` CLI is on the roadmap.

## Why the LLM Does Not Resolve Topology

The network graph is the absolute source of truth. LLMs are probabilistic text generators, not structural arbiters. If an LLM is given ambiguous structure or conflicting branches and asked to resolve them, it will guess—introducing non-determinism and silent corruption into the network.

To maintain mathematical rigor, topological collisions in the intention network must be mathematically filtered by the graph *before* prompt assembly. If unresolved collisions exist, the system must fail loud or demand an explicit resolution node from the human operator, rather than relying on an LLM to probabilistically resolve structural ambiguity.

## Operating Principle

**The graph decides membership. The assembler decides context. The LLM does not resolve topology.**

## Modes

The Context Assembler will operate in several modes to handle different degrees of ambiguity or intention exploration.

### strict
The default, rigid mode. The assembler only collects context from explicitly linked, unbroken, collision-free paths. If any ambiguity or collision is detected, the assembly fails loudly.

### compare
Collects contexts from divergent branches or conflicting states and formats them side-by-side. This mode is used when a node needs to explicitly evaluate competing realities or abstractions.

### propose
A speculative mode that attempts to assemble context even when explicit paths are missing, using heuristics to suggest possible connections.

## Mode coverage today

**Only `strict` mode is implemented.** `assembleContext` rejects any
other mode (`src/runtime/context/assembler.ts:16`). `compare` and
`propose` are aspirational — see
[`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §4.5 — and remain
on the roadmap.

## Failure Cases

In `strict` mode, the Context Assembler must terminate loudly and explicitly (crashing early instead of failing silently) under the following conditions:

- **missing target node:** The root node requested for context assembly does not exist in the physical or semantic state.
- **missing ancestor:** A required dependency or parent node in the expected path cannot be resolved.
- **branch mismatch:** The temporal or semantic continuity of a branch is broken (e.g., conflicting `previousEventId` chains).
- **unresolved collision:** Two paths provide contradictory context for the same scope without an explicit resolution node.

## Non-Goals

The Context Assembler is strictly an observational and mapping utility. It specifically **does not**:
- **no LLM execution:** It does not invoke any models or generate responses.
- **no mutation:** It performs strictly read-only operations on the network; it does not write new events or nodes.
- **no compiler:** It does not produce executable code or compile artifacts.

The SemanticLinker (a separate runtime module) layers presheaf gluing and
intent validation on top of the assembler's output. The assembler stays
pure; the linker is the validation hop.

## CLI Surface

*Implemented: strict mode, edge-aware assembly, presheaf/gluing validation*

```bash
onto context assemble <nodeId>
onto context assemble <nodeId> --json
onto context assemble <nodeId> --include-edges
onto context assemble <nodeId> --include-edges --edge-types depends_on,validates_against
```

The `--include-edges` flag projects edges incident to the focal node and its
ancestors into the assembled context. Neighbor nodes brought in by those edges
are appended to the `nodes` list and surfaced separately as `edgeContext.edges`
and `edgeContext.nodeIds`. The `--edge-types <list>` flag narrows which edge
types contribute.

## SemanticLinker (Edge-Aware)

The SemanticLinker is the programmatic counterpart of `run context --validate`.
It walks the focal node's local neighborhood, glues the presheaf fragments,
and validates a candidate response against the result.

When invoked with `includeEdges: true`, the linker passes through to
`assembleContext --include-edges`, so neighbor nodes brought in via typed
edges contribute their `requires` / `provides` / `forbids` to the gluing
pipeline. This is what makes the linker *topologically honest*: a focal
`requires` can be satisfied by an edge neighbor's `provides`, and an edge
neighbor's `provides` can trigger a focal `forbids` that the parent path
alone would not catch.

`edgeTypes` narrows which edge types contribute. Behaviour matches the CLI's
`--include-edges --edge-types <list>` exactly.

The linker now has two surfaces:

- **`onto link <nodeId> --candidate <text>` CLI** (post-Bootstrap 0.9): wraps
  `semanticLink()` and renders the gluing matrix + validation block + edge
  proposal suggestions for unsatisfied requirements as a single card. See
  `docs/CLI_COMMANDS.md` for the full surface.
- **Walker `:link-analysis` action**: defaults the candidate to
  `focal.prompt.raw` so the analysis is reachable without typing a
  candidate. Renders into the unified info panel. See
  `docs/WALKER_INTERFACE.md`.

Both surfaces are read-only; edge suggestions are printed as
copy-pasteable `onto propose link …` commands rather than auto-staged
proposals — that keeps "models may speak; only explicit graph commands
may mutate" honest at the linker layer.

*Planned modes:*
- `compare` — collect contexts from divergent branches and format side-by-side
- `propose` — speculative assembly when paths are missing
- `neighborhood slicing` — query the graph by depth bound
- PromptAST rewriting — `@expand: <nodeId>` resolves and substitutes the
  referenced node's compiled artifact into the body. Today the marker is
  parsed and exposed as metadata only; no module rewrites the body.

## Future Extensions

Future phases would introduce the `compare` and `propose` modes, and
extend PromptAST so `@expand:` actually rewrites the prompt body. Both
are roadmap items; neither is in the code today.
