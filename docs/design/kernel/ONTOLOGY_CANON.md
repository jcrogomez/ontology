# Ontology Canon

## The Mathematical Canon

The absolute foundational truth of this project is defined by the following mathematical canon:

> "Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction, where prompts act as rewrite rules that expand subgraphs, context is assigned locally as a presheaf over graph neighborhoods, and compilation is a structure-preserving functor from the category of intention to the category of executable artifacts."

## What Ontology Is

1. **A Semantic Network Editor**: Ontology is a terminal-first CLI tool designed to edit, manage, and validate a multidimensional network of semantic intention.
2. **A Temporal Graph**: Every state change in the network is represented as an append-only event log. Time and mutation are strictly tracked, guaranteeing topological consistency.
3. **The Absolute Source of Truth**: The `.ontology` directory and its contents (the graph, the nodes, the temporal events) act as the final, absolute source of truth for the system being modeled.
4. **A Rigorous Kernel**: It enforces strict cryptographic hashing, structural integrity, and type validation on every file and mutation to prevent corruption of the semantic network.

## What Ontology is NOT

1. **Not a Prompt-to-Code Generator**: It does not take a single text prompt and instantly spit out a full application. Code generation is a downstream compilation step of the network, not the primary mechanism.
2. **Not a Tree / Flat File List**: The network consists of a typed, directed multigraph. Multiple typed relations can connect the same nodes, representing complex dimensional relationships that trees cannot express.
3. **Not Tied to a Specific Framework**: Ontology does not hardcode assumptions about React, Python, or XState. Frameworks are simply modeled as abstract nodes within the graph.
4. **Not a Web Application (Yet)**: Ontology currently operates strictly via terminal interfaces and the CLI. (A Visual DAG Studio is *Planned / Not yet implemented*).

## Core Design Axioms

1. **Structural Minimalism**: The architecture relies on rigorous simplicity. There is no preemptive abstraction; code and data structures only expand when strictly mathematically necessary.
2. **Antifragile Validation**: Validation separates physical existence, semantic schema validity, and cryptographic integrity. The system strictly prefers throwing explicit errors and failing loudly to masking inconsistencies.
3. **Brutalist Presentation**: The terminal output is designed for humans and machines. It is stark, highly structured, deeply nested, and eschews unnecessary UI flourishes for raw data clarity.
4. **Local Context over Global State**: Context is explicitly isolated into local neighborhoods (presheaves). The system does not attempt to resolve the entire global state at once, prioritizing localized structural parsing.
