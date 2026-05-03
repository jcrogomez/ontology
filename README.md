# Ontology

## What Ontology is

Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction, where prompts act as rewrite rules that expand subgraphs, context is assigned locally as a presheaf over graph neighborhoods, and compilation is a structure-preserving functor from the category of intention to the category of executable artifacts.

Ontology is a terminal-first editor for a typed, temporal, multidimensional semantic network. The network is the absolute source of truth. Code is the compiled shadow of a valid semantic network.

## Current Status: Bootstrap 0.2.x / Context + Mock Runtime Preparation

Current maturity: Bootstrap 0.2.x / Context + Mock Runtime Preparation alpha over a hardened 0.1 kernel.

Bootstrap 0.2 introduces the ability to grow the network through controlled CLI mutations (specifically, creating semantic nodes).

**Note: Ontology still does not parse prompts into ASTs, execute models, create typed edges, or compile code in Bootstrap 0.2.**

We are building a node editor over a verified network kernel, not a code generator yet.

## Available Commands

For local development, commands are run via `npm run dev -- <command>`.
The eventual installed CLI form is `onto <command>`.

### Bootstrap 0.1
- `npm run dev -- init` - Initializes the minimal `.ontology` network.
- `npm run dev -- validate` - Verifies hashes, schemas, and referential integrity.
- `npm run dev -- inspect` - Summarizes the current topological state.

### Bootstrap 0.2
- `npm run dev -- node create --level <level> --kind <kind> --prompt "<prompt>"` - Generates a semantic node and appends a `node_created` temporal event.

## Quick Start

```bash
npm install
npm run check
rm -rf .ontology
npm run dev -- init
npm run dev -- node create --level domain --kind entity --prompt "Harvest has seededQuantity, harvestedQuantity and status."
npm run dev -- validate
npm run dev -- inspect
```

## What Comes Next

- Bootstrap 0.3: Edges and Graph Queries
- Bootstrap 0.4: Assets, Models and Processors
- Bootstrap 0.5: Presets and Stack Nodes
- Bootstrap 0.6: Map and Slice
- Bootstrap 0.7: PromptAST
- Bootstrap 0.8: Minimal Compiler
