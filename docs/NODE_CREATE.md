# Node Create

## Purpose
The `node create` command is responsible for structurally expanding the network. It instantiates a new entity within the ontology as an isolated node in a pure "draft" state, effectively establishing the foundational coordinates required for further semantic elaboration, routing, and processing.

## Files Mutated
*   `.ontology/state.json`: Global temporal and state tracking fields are updated.
*   `.ontology/events.jsonl`: A new `node_created` event is appended.
*   `.ontology/nodes/<nodeId>.json`: A completely new node file is structurally generated.

## Files Not Mutated
*   `.ontology/edges.jsonl`: No edges are written in Bootstrap 0.2 alpha during node creation.
*   `src/`, `tests/`, and all structural kernel files remain untouched.
*   Any preexisting `.ontology/nodes/<previousNodeId>.json` files remain completely isolated from this process.

## Preserved Invariants
*   **Temporal Progression (`state.json`):** Both `state.nodeCount` and `state.eventCount` strictly increment by exactly 1.
*   **Temporal Chain (`events.jsonl`):** The appended `node_created` event securely references the `previousEventId` correctly. Additionally, `state.lastEventId` strictly matches the newly generated event's ID.
*   **Cryptographic Integrity (`node.json`):** The node strictly preserves its structure, as the object's `integrity.hash` must flawlessly match the SHA-256 hash recomputed from its pure core structure.
*   **Structural Validity:** The generated object rigorously validates against the authoritative `OntologyNodeSchema`.

## Rejected Inputs
*   **Invalid Abstraction Level:** Values that fall outside the explicitly supported levels mapped in `AbstractionLevelSchema` (e.g., passing `--level invalid_level`).
*   **Invalid Node Kind:** Values not formally recognized within `NodeKindSchema` (e.g., passing `--kind invalid_kind`).

## Validation Strategy
The command intentionally strictly fails if structural validations are violated. The validation happens across three distinct planes: physical existence, cryptographic integrity, and semantic validity. It prevents creation when structural prerequisites are malformed but gracefully tracks valid generation in the system graph.

## Manual Smoke Test
```bash
onto init
onto node create --level domain --kind entity --prompt "Harvest has seededQuantity, harvestedQuantity and status."
onto validate
```

## Future Extension Points
*   Implementation of prompt parsing to structural elements via PromptAST.
*   Creation of typed edge references inside `.ontology/edges.jsonl`.
*   Invoking models to automatically synthesize `rules` and `context` properties based on prompt context.