# Ontology Commenting Guide

## Philosophy

**"Comments are local evidence of intention."**

In this codebase, comments should not describe *what* the code does syntactically. Instead, they must answer the following questions:

1. What part of the network are we manufacturing?
2. What invariant does this protect?
3. How will we know if it fails?
4. How can future phases extend it?

## Rules

- **Do NOT** comment on imports or obvious syntax.
- **DO** comment on ontological intention.
- **DO** comment on invariants.
- **DO** comment on phase boundaries.
- **DO** comment on failure modes.
- **DO** comment on extension points.

## Good Examples

```typescript
// Bootstrap boundary:
// no prompt parsing, no compiler, no model execution in this phase.

// Ontology invariant:
// code artifacts are replaceable, but semantic nodes must remain auditable.

// Failure mode:
// a missing root node means the network has no semantic origin.

// Future extension point:
// model refs will later resolve into provider-specific execution adapters.
```

## Bad Examples

```typescript
// Import fs
import fs from "node:fs";

// Create directory
fs.mkdirSync(dir);
```
