# Ontology Mathematical Model

"Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction, where prompts act as rewrite rules that expand subgraphs, context is assigned locally as a presheaf over graph neighborhoods, and compilation is a structure-preserving functor from the category of intention to the category of executable artifacts."

## 1. Typed Directed Multigraph

- Nodes are typed semantic objects.
- Edges are typed semantic relations.
- Multiple semantic relations may connect the same pair of nodes.
- This is why Ontology is not a tree and not a flat prompt list.

## 2. Temporal Event Log

- Every mutation of the network is represented as an append-only event.
- Time is not inferred from file modification timestamps.
- Events make audit, replay and branching possible.

## 3. Abstraction Poset

- Nodes live in a partially ordered abstraction space.
- Canon, project, target, stack, architecture, domain, workflow, interface, unit, token and artifact are abstraction coordinates, totally ordered top → bottom.
- Higher abstraction nodes constrain lower abstraction nodes.
- Lower nodes may refine but not mutate higher nodes.
- The four refinement-family edges (`refines`, `inherits_from`, `implements`, `belongs_to`) carry direction semantics consistent with this axiom: they must climb toward more abstraction (source level ≤ target level in concreteness, i.e. source is at or below target in the poset). Inversions are rejected at link time and detected retroactively by `onto validate`. Other edge types remain direction-agnostic.

## 4. Prompt Rewriting

- Prompts are not inert text.
- Future phases will parse prompts into ASTs.
- Prompt functions may expand compact intentions into subgraphs.
- Bootstrap 0.1 does not implement rewriting yet, but the schema leaves space for it.

## 5. Context Presheaf

- Each node declares requires, provides, forbids and optional context.
- Context is local to graph neighborhoods.
- Future validation will attempt to glue local contexts into a globally consistent state.

## 6. Compiler Functor

- Compilation maps intention objects and semantic relations into executable artifact objects and relations.
- Compilation must preserve structure.
- Framework choice must come from target/stack nodes, not from hardcoded compiler assumptions.
- **Implemented (Bootstrap 0.8).** `onto compile run <nodeId>` walks the topological plan computed by `computeCompilePlan` and dispatches each step's prompt against the configured provider. The order is *derived* from the graph (hard-dependency edges + Kahn's algorithm), not hand-coded; that is the structure-preserving property. See `docs/COMPILER.md` for the full implementation.
- The mock provider acts as the **identity functor** when `task: code_sketch` — it returns the prompt verbatim. This makes mock-driven compilation a degenerate but mathematically valid case of axiom 6, and is what powers the offline `npm run example:hello-world` demo.

## 7. Code as Compiled Shadow

- Code is not the source of truth.
- Code is a generated artifact.
- Generated artifacts must be traceable to nodes, edges, events and hashes.
- **Implemented.** Every artifact under `.ontology/artifacts/generated/<nodeId>.<ext>` is anchored by a `compilation_run` event whose payload carries `nodeId`, `runId`, `cached`, and `artifactRelativePath`. The `runId` resolves to a content-addressed `PersistedRun` record whose `input.promptHash` ties back to the source node body. The audit chain `artifact → event → run → prompt hash → node` is replayable end-to-end.

```text
┌─────────────────────────────────────────────┐
│                  CANON                      │
│   typed temporal graph + abstraction poset  │
└─────────────────────┬───────────────────────┘
                      │ constrains
                      ▼
┌─────────────────────────────────────────────┐
│                 NODES                       │
│ prompts, inputs, rules, models, processors  │
└─────────────────────┬───────────────────────┘
                      │ connected by
                      ▼
┌─────────────────────────────────────────────┐
│                 EDGES                       │
│ typed semantic relations                    │
└─────────────────────┬───────────────────────┘
                      │ audited by
                      ▼
┌─────────────────────────────────────────────┐
│                EVENTS                       │
│ append-only temporal log                    │
└─────────────────────┬───────────────────────┘
                      │ validated through
                      ▼
┌─────────────────────────────────────────────┐
│              VALIDATION                     │
│ schema + hash + topology + registry checks  │
└─────────────────────┬───────────────────────┘
                      │ future
                      ▼
┌─────────────────────────────────────────────┐
│              COMPILATION                    │
│ functor from intention to artifacts         │
└─────────────────────────────────────────────┘
```
