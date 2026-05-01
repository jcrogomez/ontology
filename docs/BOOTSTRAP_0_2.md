# Bootstrap 0.2: Node Editor

## Canon

Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction, where prompts act as rewrite rules that expand subgraphs, context is assigned locally as a presheaf over graph neighborhoods, and compilation is a structure-preserving functor from the category of intention to the category of executable artifacts.

## Objective

Allow the network to grow through controlled CLI mutations instead of manual JSON edits.

## Node Create Mutation

`node create` is a semantic and temporal mutation of the network. It explicitly ensures that:

- A new node file is generated within `.ontology/nodes/`.
- A `node_created` temporal event is appended to `.ontology/events.jsonl`.
- The network's summary in `.ontology/state.json` is updated.
- `graph.parentId` defaults to pointing to the root canon node to establish a minimal hierarchy.

It explicitly **does not**:
- Create typed edges (`edges.jsonl` remains unmutated).
- Typed topology and edge routing begins in Bootstrap 0.3.

## Command Usage

```bash
npm run dev -- node create --level domain --kind entity --prompt "Harvest has seededQuantity, harvestedQuantity and status."
```

*(Note: In production environments, this maps to `onto node create ...`)*

### Expected Output

```
=== ONTOLOGY NODE CREATED ===
Node:      node_0001
Level:     domain
Kind:      entity
Parent:    node_0000_canon
```

## Acceptance Execution

```bash
npm run check
rm -rf .ontology
npm run dev -- init
npm run dev -- node create --level domain --kind entity --prompt "Harvest has seededQuantity, harvestedQuantity and status."
npm run dev -- validate
npm run dev -- inspect
```

### Expected Inspect Output

```
Nodes: 2
Events: 2
Edges: 0
```

## Out of Scope for Bootstrap 0.2

What is NOT included in this bootstrap phase:

- `node list`
- `node show`
- `node link`
- Edge creation (edges between nodes)
- PromptAST parsing
- Compiler (generating executable artifacts)
- Model execution (LLM/AI integrations)
- Processor execution
