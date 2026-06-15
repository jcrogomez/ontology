import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  replayEvents,
  diffReplayedState,
  materializeReplayedState,
} from "../src/kernel/core/state/replay.js";
import {
  OntologyEventSchema,
  type OntologyEvent,
  type OntologyState,
} from "../src/kernel/schemas/ontology.js";

// Property-based companion to replay-cli.test.ts. The CLI test pins the
// replay law (§4.4, T1) over ONE real mutation history; here the fold runs
// over randomised event logs — arbitrary interleavings of counting and
// non-counting events — and over randomised tamperings of the chain.

// Event types that participate in the fold's counters, plus a sample of the
// "chain-only" types (replay must count the chain but derive nothing else).
const COUNTING_OPS = ["node_created", "edge_created", "edge_removed"] as const;
const CHAIN_ONLY_OPS = [
  "node_updated",
  "validation_run",
  "compilation_run",
  "proposal_created",
  "proposal_applied",
  "node_inspected",
] as const;

type Op = (typeof COUNTING_OPS)[number] | (typeof CHAIN_ONLY_OPS)[number];

const arbOps: fc.Arbitrary<Op[]> = fc.array(
  fc.constantFrom<Op>(...COUNTING_OPS, ...CHAIN_ONLY_OPS),
  { maxLength: 40 },
);

// Drop edge_removed ops that would underflow, so that
// edgeCount = #created − #removed holds as a closed formula (the fold's
// clamp never fires). The clamp itself is exercised separately below.
function withoutUnderflow(ops: Op[]): Op[] {
  let balance = 0;
  const out: Op[] = [];
  for (const op of ops) {
    if (op === "edge_created") balance += 1;
    if (op === "edge_removed") {
      if (balance === 0) continue;
      balance -= 1;
    }
    out.push(op);
  }
  return out;
}

function buildLog(ops: Op[]): OntologyEvent[] {
  const events: OntologyEvent[] = [];
  let prev: string | null = null;
  const push = (eventType: string, payload: Record<string, unknown> = {}): void => {
    const eventId = `evt_${String(events.length).padStart(6, "0")}`;
    events.push(
      OntologyEventSchema.parse({
        eventId,
        sequence: events.length,
        timestamp: `2026-06-10T00:00:00.${String(events.length % 1000).padStart(3, "0")}Z`,
        eventType,
        branch: "main",
        previousEventId: prev,
        payload,
      }),
    );
    prev = eventId;
  };
  push("system_init", {
    rootNodeId: "node_0000_canon",
    schemaVersion: "1.0.0",
    projectName: "replay-property",
  });
  for (const op of ops) push(op);
  return events;
}

describe("replayEvents — the fold law over randomised histories (§4.4, T1)", () => {
  it("derived fields are exact closed formulas over the log", () => {
    fc.assert(
      fc.property(arbOps.map(withoutUnderflow), (ops) => {
        const events = buildLog(ops);
        const { replayed, chainViolations, warnings } = replayEvents(events);

        expect(chainViolations).toEqual([]);
        expect(warnings).toEqual([]);
        expect(replayed.initialized).toBe(true);
        expect(replayed.schemaVersion).toBe("1.0.0");
        expect(replayed.projectName).toBe("replay-property");
        expect(replayed.rootNodeId).toBe("node_0000_canon");
        expect(replayed.activeBranch).toBe("main");
        expect(replayed.eventCount).toBe(ops.length + 1);
        expect(replayed.nodeCount).toBe(
          1 + ops.filter((op) => op === "node_created").length,
        );
        expect(replayed.edgeCount).toBe(
          ops.filter((op) => op === "edge_created").length -
            ops.filter((op) => op === "edge_removed").length,
        );
        expect(replayed.lastEventId).toBe(events[events.length - 1].eventId);
        expect(replayed.genesisTimestamp).toBe(events[0].timestamp);
        expect(replayed.lastTimestamp).toBe(events[events.length - 1].timestamp);
      }),
    );
  });

  it("edgeCount never goes negative, even on histories where removals outnumber creations", () => {
    fc.assert(
      fc.property(arbOps, (ops) => {
        const { replayed, chainViolations } = replayEvents(buildLog(ops));
        expect(chainViolations).toEqual([]);
        expect(replayed.edgeCount).toBeGreaterThanOrEqual(0);
        expect(replayed.edgeCount).toBeGreaterThanOrEqual(
          ops.filter((op) => op === "edge_created").length -
            ops.filter((op) => op === "edge_removed").length,
        );
      }),
    );
  });

  it("round-trip: materialising the fold and diffing it back reports zero divergence", () => {
    const existing: OntologyState = {
      initialized: true,
      schemaVersion: "0.0.0",
      projectName: "stale",
      rootNodeId: "node_9999_stale",
      activeBranch: "main",
      nodeCount: 999,
      edgeCount: 999,
      eventCount: 999,
      lastEventId: "evt_stale",
      createdAt: "1999-01-01T00:00:00.000Z",
      updatedAt: "1999-01-01T00:00:00.000Z",
    };
    fc.assert(
      fc.property(arbOps, (ops) => {
        const { replayed } = replayEvents(buildLog(ops));
        const materialized = materializeReplayedState(replayed, existing);
        expect(diffReplayedState(replayed, materialized)).toEqual([]);
        // Wall-clock fields come from event timestamps, not from `existing`.
        expect(materialized.createdAt).toBe(replayed.genesisTimestamp);
        expect(materialized.updatedAt).toBe(replayed.lastTimestamp);
      }),
    );
  });
});

describe("replayEvents — chain integrity over randomised tamperings", () => {
  // A tamper picks an index and a kind; every kind must surface at least one
  // chain violation (the fold verifies sequence and previousEventId links).
  const arbTamper = fc.record({
    kind: fc.constantFrom("sequence_bump", "previous_id_forged", "adjacent_swap"),
    index: fc.nat(),
    bump: fc.integer({ min: 1, max: 5 }),
  });

  it("any single tamper of the chain is detected", () => {
    fc.assert(
      fc.property(arbOps, arbTamper, (ops, tamper) => {
        const events = buildLog(ops);
        const i = tamper.index % events.length;
        const tampered = events.map((ev) => ({ ...ev }));

        if (tamper.kind === "sequence_bump") {
          tampered[i].sequence += tamper.bump;
        } else if (tamper.kind === "previous_id_forged") {
          tampered[i].previousEventId = "evt_forged";
        } else {
          if (events.length < 2) return; // nothing to swap
          const j = Math.max(1, i);
          [tampered[j - 1], tampered[j]] = [tampered[j], tampered[j - 1]];
        }

        const { chainViolations } = replayEvents(tampered);
        expect(chainViolations.length).toBeGreaterThan(0);
      }),
    );
  });

  it("a truncated log still replays clean (prefix-closure of the chain)", () => {
    fc.assert(
      fc.property(
        arbOps.filter((ops) => ops.length >= 1),
        fc.nat(),
        (ops, cut) => {
          const events = buildLog(ops);
          const keep = 1 + (cut % events.length);
          const { chainViolations, replayed } = replayEvents(events.slice(0, keep));
          expect(chainViolations).toEqual([]);
          expect(replayed.eventCount).toBe(keep);
        },
      ),
    );
  });
});
