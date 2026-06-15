# Intent Narration — the WHY-as-prompt lift

> Status (2026-06-01): prompt + neighbourhood builder + **CLI wiring shipped and
> tested** — `onto ingest --intent [<files...>]` (`src/runtime/legend/intent-narration.ts`,
> wired in `src/commands/ingest/index.ts`, `tests/intent-narration.test.ts` +
> `tests/ingest-intent-cli.test.ts`). A real-model run (frontier) is the last
> step. This is the designed path toward filling the **intent** column of the
> fidelity cartography matrix, currently explicit no-data (see `ROADMAP.md`).

## Why this exists

The shipped `EXTRACTION_SYSTEM_PROMPT` (`src/commands/ingest/index.ts`) is a
**contract** extractor: it specifies what a future implementation MUST recreate
— exact exported symbols, signatures, re-export obligations — optimised for a
round-trip measured by **structural Jaccard**. That is the *what*, and it is
genuinely useful for the structural axis. But it is **not intent**. Restating
`add(a, b)` as *"MUST return the sum of a and b"* is the code in imperative
mood, not the reason the code exists.

A perfect contract round-trips perfectly **and captures zero intent** — the
metric rewards the tautology. Worse, the contract extractor is *anti-compression*
by design (its MANDATORY-EXPORTS block forbids dropping symbols), while intent
is **lossy by design**: the 3-sentence purpose is the durable artifact; the 700
lines are the shadow.

Intent narration asks the other question — the one a senior engineer answers
when you point at a file and ask *"why does this exist, and why like this?"* —
and writes the answer as a **generative prompt**.

## The four questions + three commitments

Every narration answers: **(1) problem** it solves, **(2) decision** taken and
alternative rejected (and why), **(3) constraints/non-goals** that govern it,
**(4) parent goal** it serves. Three commitments separate it from a contract:

1. **Compress, don't preserve.** Omit implementation detail that is merely one
   valid realisation. If a different structure/library/name would serve the
   purpose equally, don't name the one in the code.
2. **Behaviour oracle, not symbol parity.** Each narration carries
   `acceptanceCriteria` — observable behaviours a faithful regeneration must
   satisfy. Faithfulness is `F(G(code)) ⊨ acceptanceCriteria`, **not**
   `F(G(code)) ≈ code`. This is the *test-oracle* pattern (Anthropic,
   "Long-running Claude"): the judge knows it's faithful by behaviour, never by
   re-emitted identifiers.
3. **Neighbourhoods, not files-in-isolation.** Higher-level intent emerges only
   from reading related files together; extraction yields *hierarchical* intent
   (per-file, plus the composed subsystem intent).

## Worked golden examples

These are reference outputs (narrated against real repo files). They are the
oracle's reference set and the prompt's few-shot exemplars. Note throughout:
`intentPrompt` never names `acquireLock`, `O_EXCL`, `writeJson`, etc. — purpose,
not symbols.

### Example 1 — single file: `src/core/fs/lock.ts`

**What the contract extractor produces today (the WHAT — for contrast):**

> provides: `acquireLock`, `withLock`, `LockAcquireError`. `acquireLock` MUST
> create the lock file via `O_CREAT|O_EXCL`, MUST record pid+hostname, MUST
> recover a stale lock when the holder PID is dead on the same host, MUST refuse
> cross-host…

**What intent narration produces (the WHY):**

```json
{
  "label": "Cooperative multi-process guard for the project directory",
  "level": "unit",
  "problem": "Two Ontology processes can run against the same project at once (an interactive run and a cron job, say). Atomic writes stop a single write from truncating a file, but they do not stop two processes from interleaving conflicting snapshots of shared state.",
  "decision": "Use a cooperative, file-based advisory guard rather than an OS-level lock. The file-based choice is deliberate: it is portable across platforms and a human can inspect who holds it with no tooling. An OS flock was rejected for being neither portable nor inspectable.",
  "constraints": [
    "Deadlock-free: a holder that dies must not block others forever.",
    "Only reclaim a guard when the previous holder is provably gone (same machine, process no longer alive).",
    "Never reclaim a guard held on another machine — remote liveness can't be proven.",
    "Advisory only: correctness still rests on the durability layer; this closes the multi-writer interleave, nothing more.",
    "Must offer an explicit bypass for callers that know concurrency is safe."
  ],
  "parentGoal": "Make the kernel safe for concurrent processes, not merely crash-safe.",
  "intentPrompt": "Build a cooperative mutual-exclusion guard for a project's working directory so two processes can't interleave conflicting writes to its shared state.\nAcquire by atomically creating a holder record that names who holds it, in a form a human can inspect without any tooling.\nIf a previous holder left its record behind but is provably gone (same machine, process no longer alive), reclaim it; if you can't prove it's gone (it's on another machine), refuse rather than risk stealing a live guard.\nRelease on normal exit and on termination signals; tolerate a hard kill by letting the next process reclaim the stale record.\nOffer an explicit bypass for callers that know concurrency is safe.\nThe guard is advisory — it assumes cooperation; the durability of individual writes is handled elsewhere.",
  "acceptanceCriteria": [
    "Two concurrent acquirers: exactly one succeeds; the other is told it is held, and by whom.",
    "If the holder is killed with no clean release, a later process on the same host can acquire.",
    "A record left by a holder on a different host is never reclaimed automatically.",
    "Releasing is idempotent and never deletes a record a different holder now owns.",
    "With the bypass enabled, acquisition is skipped entirely.",
    "The holder record is human-readable without the tool."
  ],
  "sourceFiles": ["src/core/fs/lock.ts"]
}
```

### Example 2 — neighbourhood: `src/core/fs/lock.ts` + `src/core/fs/json.ts`

The **composed** intent — which neither file states alone:

```json
{
  "label": "Durable, crash- and concurrency-safe kernel substrate",
  "level": "architecture",
  "problem": "The kernel's whole value is provenance. A crash mid-write, or a second process interleaving writes, can truncate or corrupt the event log and state — destroying exactly the trust the system sells.",
  "decision": "Make fail-safety a property of the persistence layer itself — all-or-nothing whole-file writes, durable appends, and cooperative locking — rather than relying on every caller to be careful. Rejected: trusting happy-path writes and a single-process assumption.",
  "constraints": [
    "A mutation either lands whole or not at all — never a truncated file.",
    "An append, once acknowledged, survives power loss.",
    "Concurrent processes do not corrupt shared state.",
    "The log only ever grows; earlier entries are never rewritten.",
    "Durability and exclusion are properties of the substrate, not of each caller."
  ],
  "parentGoal": "Make 'every artifact is traceable to the events and hashes that authorised it' a guarantee the kernel cannot violate, even under crashes and concurrency.",
  "intentPrompt": "Make the kernel's on-disk state a substrate you can trust under crashes and concurrent access, so provenance is never silently corrupted.\nEvery full-file write must be all-or-nothing and survive power loss; every log append must be durable once acknowledged; the log must only ever grow; and independent processes operating on the same project must not interleave into corruption.\nPush these guarantees into the persistence layer itself, so no individual command has to remember to be careful — a caller that just 'writes state' or 'appends an event' gets atomicity, durability, and (for the dangerous long-running operations) mutual exclusion for free.",
  "acceptanceCriteria": [
    "Killing the process mid-write leaves the previous file intact — never a partial file.",
    "An append that returned is still present after a simulated power loss.",
    "Two long-running operations on the same project cannot both mutate state concurrently.",
    "No operation rewrites earlier log entries.",
    "These hold without the calling command doing anything special."
  ],
  "sourceFiles": ["src/core/fs/lock.ts", "src/core/fs/json.ts"]
}
```

## The oracle (how a narration is judged)

A regeneration `code' = F(intentPrompt)` is **faithful** iff `code'` satisfies
every entry in `acceptanceCriteria` — checked by behaviour (run it, call it,
crash it mid-write), not by symbol parity. This is deliberately a *behaviour*
metric, so it (a) does not reward the contract-tautology, (b) accepts a
differently-shaped-but-purpose-equivalent rebuild, and (c) makes the
deliberate lossiness of intent a feature rather than measured loss. It is the
same axis as the existing behaviour-checker, pointed at intent rather than
structure.

## CLI

```
onto ingest --intent [--dry-run] [--json] [--provider <p>] [--parent <id>] <files...>
```

- One or several **file paths** are read as one neighbourhood; a directory is
  expanded by `--include` (default `ts,tsx`). Mutually exclusive with
  `--from-pr` / `--from-issue`.
- Dispatches `INTENT_NARRATION_PROMPT` through the cross-provider dispatcher,
  validates the `IntentNarration` shape (Zod), and re-anchors `sourceFiles` to
  the files actually fed.
- Unless `--dry-run`, creates one **`manifestation=intent`** `node_create`
  proposal whose `rules` carry the behaviour oracle as `REQUIRE:` lines and
  whose `prompt` is the `intentPrompt`. No code-path manifestation override (an
  intent node stays intent even when lifted from a `.ts` file).

## Next steps (not yet done)

1. Neighbourhood selection: group related files (by directory, by edge, by
   import cluster) before narrating composed intent — today the caller supplies
   the neighbourhood explicitly.
2. Run against a frontier model on a small fixed slice and judge each narration
   by the behaviour oracle — the first real datum for the cartography matrix's
   intent column. (Local 8 GB is insufficient for the quality bar; this is
   budget/frontier-gated, like the §3.10 variance run.)
