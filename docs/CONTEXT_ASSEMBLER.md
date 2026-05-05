# Context Assembler

## Purpose

The Context Assembler solves the problem of deterministic, localized prompt assembly for the LLM. In an intention network, where the canon of knowledge and structure is distributed across a typed, temporal, directed graph, a model cannot simply be fed the entire network or a random subset. The Context Assembler acts as the rigid, deterministic lens that computes the precise sub-graph (presheaf) required to expand a specific node. It gathers context by walking the graph based strictly on explicit topological rules.

*Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction, where prompts act as rewrite rules that expand subgraphs, context is assigned locally as a presheaf over graph neighborhoods, and compilation is a structure-preserving functor from the category of intention to the category of executable artifacts.*

However, in this phase, the system only implements deterministic context assembly; it does not implement rewrite rules, the SemanticLinker, or the final compiler.

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

## Strict Mode in This Phase

In the current implementation phase, **only `strict` mode is implemented**. The system relies entirely on absolute determinism. Compare and propose modes are reserved for future architectural expansions.

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

The linker is a pure programmatic API today; future PRs may expose it via
CLI or wire it into Walker v1's validation mode.

*Planned modes:*
- `compare` — collect contexts from divergent branches and format side-by-side
- `propose` — speculative assembly when paths are missing
- `neighborhood slicing` — query the graph by depth bound
- PromptAST integration — prompts as rewrite rules over the assembled subgraph

## Future Extensions

Future phases will introduce the `compare` and `propose` modes, integrating
deeper with the PromptAST to allow models to act as rewrite rules that
explicitly expand subgraphs based on the assembled context.
