# The sync loop — closing intent → code in one command

This is the **how-to** for the governed sync loop. For the design
contract and acceptance criteria, see
[`SYNC_LOOP_SPEC.md`](SYNC_LOOP_SPEC.md). For the per-command flag
reference, see [`CLI_COMMANDS.md`](../../CLI_COMMANDS.md).

## What the loop is

The thesis says code is the compiled shadow of an intent graph. The sync
loop is that thesis made into a daily move: **edit a node's intent, run
one command, and watch verified code land — or watch it refuse, with the
precise reason.**

```
edit a node's intent
        │
        ▼
  onto sync <node>
        │
        ├─ regenerate the shadow from intent   (F, 3-draw consensus)
        ├─ gate ① structural verdict           (is it structure-preserving?)
        ├─ gate ② behaviour fixture            (does it still behave?)
        ├─ gate ③ declared rules               (FORBID/REQUIRE honoured?)
        │
        ├─ ALL pass ─▶ write the shadow + re-anchor THIS node's drift
        └─ ANY block ─▶ write nothing · exit ≠0 · name the blocking gate
```

It is a **thin composition** of primitives that already exist
(`regenerate`, the three gates, a per-node drift re-anchor). It adds no
new verification logic — it flips every gate on by default and shows the
whole decision in one place.

## Before you begin

```bash
npm run build                 # the loop runs from dist/cli.js (or use npm run dev -- …)
ollama list                   # a local model; qwen2.5-coder:7b is the proven 8 GB pick
```

The loop writes real source files, so it is gated hard: it overwrites a
shadow **only** when every applicable gate passes. Preview anything first
with `--dry-run`.

## 1. See what you can sync — `onto status`

Read-only. Nothing is written; no fixtures are run.

```text
$ onto status
◆ onto status — graph health (228 nodes, 221 with a code shadow)

  syncable core:     43   shadow + behaviour fixture + rules clean
  syncable (lower):  178  no behaviour fixture — lower confidence
  blocked:           0    static rule violation to resolve first

  fixtures:  43/221 trackable shadows have a behaviour fixture
  drift:     ✖ 5 shadow(s) drifted from the anchor
  ficha:     1 node(s) under-declare exports (+2 total), 57 prose-rule(s) to prune
```

- **core** — a code shadow **and** a behaviour fixture **and** no static
  rule violation. The nodes you can sync with a safety net.
- **lower confidence** — syncable, but with no behavioural fixture to
  catch a same-shape-wrong-behaviour regression.
- **blocked** — has a static rule violation to resolve first.

`onto status --list` prints the node ids in each tier; `--json` gives the
full per-node detail.

## 2. Close the loop — `onto sync <node> --explain`

`--explain` shows the reasoning so you can follow the decision without
reading any code. Here is a clean pass (from the 2026-06-14 acceptance,
`node_0011` = `src/core/errors.ts`):

```text
$ onto sync node_0011 --provider ollama --model qwen2.5-coder:7b --explain
◆ sync node_0011 — reasoning
  draws:      3/3 agree (need 2); acceptable 3/3; clusters [3]
  structural: epsilon_equivalent  (loc-dist 0.000, jaccard 1.000)
  behaviour:  pass
  rules:      clean (0 violations)

✔ SYNC node_0011 — WROTE (all gates passed)
  wrote:  src/core/errors.ts
  re-anchored: src/core/errors.ts (this node only)
```

The re-anchor is **path-scoped on purpose**: it refreshes only this
node's drift baseline. A bare `onto drift --update` would re-anchor the
whole graph and silently hide drift in every *other* node — exactly what
the loop is meant to keep honest.

## 3. Where it refuses

A refusal writes nothing, exits non-zero, and names the gate. The most
common refusal on a weak local model is **no consensus** — the draws are
individually plausible but disagree on structure, so none reaches the
floor:

```text
$ onto sync node_0225 --provider ollama --model qwen2.5-coder:7b
✖ SYNC node_0225 — REFUSED (wrote nothing)
  reason: consensus not reached: largest agreeing class is 1/3 (need 2)
          — refusing to write an unstable regeneration
```

Other refusals you'll see, each precise:
- `verdict divergent_structural is not structure-preserving …` — the
  regen reshaped the code (gate ①).
- `behaviour check failed …` — structurally fine, but a fixture case
  changed outcome (gate ②). The net that earns its keep.
- `N declared rule(s) violated …` — a `FORBID`/`REQUIRE` symbol broke
  (gate ③).

Preview any of this without touching source:

```bash
onto sync node_0225 --provider ollama --model qwen2.5-coder:7b --dry-run --explain
```

## 4. The honest number

How often does a core node actually round-trip clean? Measure it — don't
guess. The acceptance harness runs the loop in `--dry-run` over a set of
core nodes and reports the fraction that would write clean:

```bash
node scripts/sync-acceptance.mjs --provider ollama --model qwen2.5-coder:7b
```

First run (2026-06-14, 6-node core sample, `qwen2.5-coder:7b`, $0):
**1/6 ≈ 17% clean, robust to draw count.** Only the smallest, simplest
node round-tripped repeatably; 7B-local regeneration is both low-yield
and high-variance. The behaviour gate caught real regressions. Full
record and the refuted "consensus is the bottleneck" hypothesis:
[`SYNC_LOOP_SPEC.md`](SYNC_LOOP_SPEC.md) §8.

The number is a **finding, not a failure of the loop** — the loop's job
is to refuse the 83% honestly, which it does. The lever to raise it is
model quality and ficha determinacy, not the consensus knob.

## What you just touched

| Command | Writes? | What it is |
|---|---|---|
| `onto status` | no | health of the graph for the loop |
| `onto sync <node> --dry-run` | no | the full loop as a preview |
| `onto sync <node>` | the shadow + that node's drift anchor | the governed write |

## Where to go from here

- The contract + acceptance criteria: [`SYNC_LOOP_SPEC.md`](SYNC_LOOP_SPEC.md).
- Generate a behaviour fixture so a node graduates to **core**:
  `onto probe <node>` (see [`CLI_COMMANDS.md`](../../CLI_COMMANDS.md)).
- Improve a node's ficha so its draws agree:
  `onto ficha audit` → `onto ficha cleanup <node>`.
