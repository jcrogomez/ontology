# Bootstrap 0.1: Network Kernel

Bootstrap 0.1 creates the smallest trustworthy Ontology universe. It does not parse prompts, execute models or compile code. It creates a frozen mathematical canon, a temporal genesis event, empty typed-edge storage, model/processor registries and a state file. This is enough for Ontology to verify its own memory before learning to edit it.

## What is included

- Project initialization structure (`.ontology/` directory tree).
- Immutable canon node creation.
- Core schema and hash validations.
- Initial state, events, and edge registries.
- Basic commands to start interacting with the network.

## What is NOT included

- `onto node create`
- `onto node link`
- `onto map`
- PromptAST
- Compiler
- Real model execution
- Multimodal asset processing

## Commands

- `onto init` - Initializes the ontology network and creates the bootstrap state.
- `onto validate` - Validates the integrity of the network, including schemas and hash matching.
- `onto inspect` - Reads the initialized project and displays its state.

## Definition of Done

To consider Bootstrap 0.1 correctly implemented and running, the following commands must execute successfully in order:

```bash
npm run check
npm run dev -- init
npm run dev -- validate
npm run dev -- inspect
```

## Corruption Test

To verify the integrity system works, you should:

1. Manually edit `.ontology/nodes/node_0000_canon.json`.
2. Change a letter in `rules` or `inputs`.
3. Run `npm run dev -- validate`.
4. It **must** fail with a hash mismatch error.
