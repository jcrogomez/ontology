# Behaviour-axis checker fixtures (Phase ε v0)

Per-node call-site manifests consumed by `onto verify-homeomorphism
--behavior-check`. See `docs/legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md`
for the design.

Each fixture file is named `<nodeId>.fixture.ts` and exports a
`cases: BehaviorCase[]` array. The verify command resolves the
fixture per node, imports both the source artefact and the regen
artefact, runs every case against both sides, and folds into a
`pass` / `fail` / `untested` verdict for the matrix's `behavior`
axis.

v0 ships ≥ 20 fixtures targeting Arm A's high-Jaccard cohort
(structural Jaccard = 1.0 on the 2026-05-19 sweep). The column —
not the saturation — is the deliverable; backfill to the full
125-node perimeter is a v1 concern (spec §3.1).

## Fixture file shape

```ts
import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

export const cases: BehaviorCase[] = [
  {
    name: "describe what the case exercises",
    setup: () => ({ /* per-case input/context */ }),
    invoke: (api, ctx) => (api as { fn: (x: unknown) => unknown }).fn(ctx),
    assert: (result) => /* per-side sanity check */ true,
  },
];
```

The runner additionally compares the two sides' return values via
structural deep-equal. A case where one side throws and the other
returns is counted as `divergent`; both sides throwing with the
same message is `match` (throwing is part of what the function
does).
