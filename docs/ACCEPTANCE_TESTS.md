# Acceptance Tests

This document outlines the manual and structural tests to verify the integrity and behavior of Ontology Bootstrap 0.1.

## Manual Smoke Test

**Steps:**

```bash
npm install
npm run check
npm run dev -- init
npm run dev -- validate
npm run dev -- inspect
```

**Expected Outputs:**
- `init` should correctly create the `.ontology` directory tree without errors.
- `validate` should complete without throwing hash mismatches or schema validation errors.
- `inspect` should successfully read the initialized project and output the current state summary.

## Corruption Test

**Steps:**

1. Manually edit `.ontology/nodes/node_0000_canon.json`.
2. Change a single letter in `rules` or `inputs`.
3. Run `npm run dev -- validate`.
4. The command **must fail** with a hash mismatch error, proving the integrity checks are working.

## Structural Failure Tests

You should manually test the following failure modes:

- Delete `.ontology/state.json` and run `validate`. It must fail.
- Delete `.ontology/events.jsonl` and run `validate`. It must fail.
- Delete `.ontology/nodes/node_0000_canon.json` and run `validate`. It must fail.
- Delete `mock_default` from the models registry and run `validate`. It must fail.
- Delete `assemble_context` from the processors registry and run `validate`. It must fail.

## Future Automated Tests

When integrating Vitest, the following suites should be covered:

- `init` creates expected structure
- `validate` passes after `init`
- `validate` fails after root node tampering
- `inspect` reads initialized project
- event count matches state
- node count matches state
- root canon contains mathematical axiom
