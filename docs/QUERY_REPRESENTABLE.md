# `onto query` — Representable-Functor Search (Yoneda)

> A node is what its arrows say it is.
> — paraphrasing the Yoneda lemma

## 1. Why this exists

Ontology stores intentions as a typed temporal multigraph. Every node has
properties (kind, abstraction level, plane, status, …) and lives inside a
web of typed edges and a context contract. The natural question is:

> *Find me every node whose profile looks like this.*

The category-theoretic answer is the **Yoneda embedding**. The Yoneda
Lemma states that an object X in a category C is fully determined, up to
isomorphism, by the *representable functor* `Hom(–, X)` — the profile of
all morphisms targeting X. Concretely for our network: a node is fully
determined by what edges arrive at it, what edges leave it, what concepts
its context provides and requires, and what intrinsic properties (kind,
status, …) classify it.

`onto query` exposes this as a CLI verb. You hand it a *partial* profile
(the **query shape**); it returns every node whose actual profile is a
superset of that shape. The empty shape `{}` matches every node — the
trivial "identity" Hom-profile.

This is search by *what you are made of*, not by id or by free-text. It
composes cleanly with the rest of Ontology because the same coordinates
(`kind`, `abstraction`, `plane`, `manifestation`, `status`, `branch`),
the same edge type vocabulary, and the same context-contract concept
ids that drive validation, compilation, and context assembly are exactly
what the query speaks.

## 2. The query shape

A query shape is a Zod-validated object. Every field is optional; an
empty shape matches all nodes.

```ts
{
  // Node-level filters (disjunctive sets — "any of").
  kind?:           NodeKind[];          // e.g. ["rule", "decision"]
  abstraction?:    AbstractionLevel[];  // e.g. ["domain", "workflow"]
  plane?:          Plane[];             // e.g. ["semantic", "data"]
  manifestation?:  Manifestation[];     // e.g. ["intent", "code"]
  status?:         NodeStatus[];        // e.g. ["valid", "compiled"]
  branch?:         string;              // exact match

  // Hom-profile filters (conjunctive — "all of").
  provides?:       string[];   // node MUST provide each listed key
  requires?:       string[];   // node MUST require each listed source
  forbids?:        string[];   // node MUST forbid each listed source
  hasIncoming?:    EdgeType[]; // ≥1 inbound edge of EACH listed type
  hasOutgoing?:    EdgeType[]; // ≥1 outbound edge of EACH listed type
}
```

Semantics in plain English:

- **Disjunctive** (`kind`, `abstraction`, `plane`, `manifestation`,
  `status`): the node's value must appear in the listed set.
  `kind: ["rule", "decision"]` means *kind is rule OR decision*.
- **Conjunctive** (`provides`, `requires`, `forbids`, `hasIncoming`,
  `hasOutgoing`): the node must satisfy every entry in the array.
  `hasIncoming: ["refines", "depends_on"]` means *(at least one inbound
  refines edge) AND (at least one inbound depends_on edge)*.
- **AND across fields**: every present field must be satisfied. Missing
  fields impose no constraint.

The schema is `z.object({...}).strict()`, so unknown keys are rejected
loudly — typos surface at parse time, not as silent zero-result queries.

### How concept-id matching aligns with the rest of the system

`provides`, `requires`, and `forbids` are matched against the *string
identifier* of each context-contract entry:

| Shape field | Matches `node.context.<X>[i].<key>` |
|-------------|-------------------------------------|
| `provides`  | `node.context.provides[i].key`      |
| `requires`  | `node.context.requires[i].source`   |
| `forbids`   | `node.context.forbids[i].source`    |

This is exactly the projection the context-presheaf engine already uses
(`src/runtime/context/presheaf.ts`). A query and the context engine
therefore agree on what "this node provides X" means; one cannot drift
from the other.

## 3. CLI usage

```
onto query [options]
```

Three input styles, in decreasing precedence:

1. `--shape '<json>'` — a literal JSON object. Most expressive.
2. `--shape-file <path>` — read the same JSON from a file. Convenient
   for shapes that live alongside source.
3. Per-field flags (`--kind`, `--abstraction`, `--has-incoming`, …) —
   convenient for one-liners. Comma-separated for arrays.

`--shape` and `--shape-file` are mutually exclusive. If either is given,
the per-field flags are ignored — explicit beats implicit. Output is a
pretty table by default; `--json` produces full node objects suitable
for scripting.

### Examples

Find every rule or decision in the network:

```
onto query --kind rule,decision
```

Find every node at abstraction `domain` or `workflow` whose status is
`valid`:

```
onto query --abstraction domain,workflow --status valid
```

Find rules that have at least one incoming `refines` edge and at least
one outgoing `depends_on` edge:

```
onto query --kind rule --has-incoming refines --has-outgoing depends_on
```

Find every node that provides the concept `db_access`:

```
onto query --provides db_access
```

Use a JSON shape literal for combined constraints:

```
onto query --shape '{
  "kind":         ["rule"],
  "status":       ["valid", "compiled"],
  "hasIncoming":  ["refines"],
  "provides":     ["spec"]
}'
```

Pipe results into `jq` for deeper inspection:

```
onto query --kind artifact --json | jq '.nodes[] | .id'
```

### Pretty output

```
=== ONTOLOGY QUERY (representable) ===
Shape:    kind=[rule] status=[valid]
Matches:  2

ID                    Kind          Abstraction   Status      Label
node_0042             rule          domain        valid       Auth must require token
node_0058             rule          workflow      valid       Idempotency on retry
```

### JSON output

```jsonc
{
  "shape":  { "kind": ["rule"], "status": ["valid"] },
  "count":  2,
  "nodes":  [ /* full OntologyNode objects, schema-validated */ ]
}
```

Errors in JSON mode are emitted on stdout as
`{ "ok": false, "error": "<message>" }` and the process exits 1.

## 4. Determinism

Results are sorted by `id` ascending. This is independent of node-load
order, filesystem readdir order, and shape contents — running the same
query twice over the same data yields byte-identical output. Callers
can diff query outputs in version control or in tests without sorting
post-hoc.

## 5. Implementation outline

- `src/runtime/query/types.ts` — Zod schema + `QueryShape` type.
- `src/runtime/query/representable.ts` — pure matcher. Pre-builds an
  `(incoming, outgoing)` edge-type index in O(|edges|) so each
  `matchesShape` call after that is O(|shape constraints|), not
  O(|edges|).
- `src/commands/query/run-query.ts` — translates CLI options into a
  validated shape, invokes `queryNodes`, prints.
- `src/commands/query/index.ts` — `registerQueryCommand(program)` is
  the single hook into `src/cli.ts`.

The matcher is a pure function: it takes `nodes`, `shape`, and `edges`
and returns the matches. No filesystem, no logging, no mutation. The
CLI runner is the only impure layer.

## 6. Limitations and non-goals

These are conscious omissions; see the corresponding open issues if you
want to lift them.

- **No negation.** You cannot say *kind is NOT rule*. Negation interacts
  unpleasantly with the conjunctive semantics of the Hom-profile (it
  flips it from monotone to non-monotone) and we want the simple form
  to stabilize first.
- **No edge-target constraints.** `hasIncoming: [refines]` matches *any*
  inbound `refines` edge; you cannot yet say *...from a node of kind
  rule*. Composing two queries (find rules; query for nodes whose
  inbound refines edges originate at one of those ids) covers most use
  cases until the shape grammar grows.
- **No exact match on edge multiplicity.** "Exactly two inbound
  `depends_on` edges" is not expressible. Existence (`≥1`) is the only
  edge-level predicate.
- **No coordinate ranges.** `time` is not a query field. The state is
  always "now" — there is no `--time` slice.
- **No fuzzy or substring text matching.** `branch` is exact. Use grep
  on `--json` output for substring search.
- **No persistence of shapes.** Shapes are not stored as nodes. If you
  want a reusable query, keep its JSON in a file under your project
  and pass `--shape-file`.

## 7. Why this is the right primitive

A graph database typically exposes "find by id", "find by attribute",
and "traverse from here". Ontology adds a fourth that is more
mathematical: *find by Hom-profile*. Because the network already
encodes intentions as morphisms, profile search is the search verb
that respects what nodes *are* in this category, rather than how
they were named or stored.

This makes the verb composable with the rest of the kernel: every
future tool that reasons over "nodes that look like X" — automated
linting (every `kind=rule` with no `validates_against` outgoing edge),
compilation gating (every `kind=artifact` with status `valid` and at
least one incoming `tests` edge), proposal scoring (candidates whose
shape matches an existing well-formed cluster) — can express its
predicate as a `QueryShape` and reuse this engine instead of
hand-rolling traversal.
