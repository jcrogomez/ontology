// κ* — the capability barometer.
//
// For a node, κ* is the SMALLEST rung of the capability ladder that closes its
// F∘G round-trip (passes the behaviour gate). It is the sensor the policy/
// architect consult to decide "escalate the model" vs "improve the intention":
// a low κ* means cheap models suffice; a high κ* means the node genuinely needs
// capacity; "never closes with clean lint" is the extraction-gap signal.
//
// Order-theoretic reading (the fruitful part): the ladder is a chain, and
// "closes" is assumed an UPWARD-CLOSED (monotone-threshold) predicate — if rung
// k closes, every k' ≥ k closes. Under that assumption the executor's climb is a
// least-element search and κ* is the threshold. The assumption is NOT free (a
// more capable model can fail where a cheaper one passed, on variance), so this
// function also reports whether the OBSERVED rungs are actually monotone and
// names any violation. That keeps the claim honest: the least-element part is T1
// (pure, tested); the monotone-threshold + rate-distortion reading is T2/T3
// (see MATHEMATICAL_CLAIMS §3.11 / EXECUTOR_SPEC §8).

export interface RungObservation {
  rung: number;
  /** Did the node close (behaviour pass) at this rung? */
  closed: boolean;
}

export interface KappaStar {
  /** The least observed rung that closed, or null if none did. */
  kappa: number | null;
  /** Observed rungs, sorted ascending. */
  observedRungs: number[];
  /** True iff `closed` is upward-closed over the observed rungs (the
   *  monotone-threshold assumption the least-element search relies on). */
  monotone: boolean;
  /** Pairs where a lower rung closed but a higher observed rung did not — a
   *  variance / non-threshold signal worth surfacing. Empty when monotone. */
  violations: { closedAt: number; reopenedAt: number }[];
}

export function kappaStar(observations: readonly RungObservation[]): KappaStar {
  // Dedup by rung (last write wins) then sort ascending.
  const byRung = new Map<number, boolean>();
  for (const o of observations) byRung.set(o.rung, o.closed);
  const observedRungs = [...byRung.keys()].sort((a, b) => a - b);

  let kappa: number | null = null;
  for (const r of observedRungs) {
    if (byRung.get(r)) {
      kappa = r;
      break;
    }
  }

  const violations: { closedAt: number; reopenedAt: number }[] = [];
  for (let i = 0; i < observedRungs.length; i++) {
    const lo = observedRungs[i];
    if (!byRung.get(lo)) continue;
    for (let j = i + 1; j < observedRungs.length; j++) {
      const hi = observedRungs[j];
      if (!byRung.get(hi)) violations.push({ closedAt: lo, reopenedAt: hi });
    }
  }

  return { kappa, observedRungs, monotone: violations.length === 0, violations };
}

// Aggregate a set of per-node κ* values into a histogram over rung → count,
// plus the count of nodes that never closed (kappa === null). The shape of this
// distribution is the rate-distortion-flavoured measurement: "how much model
// capability does this codebase's F∘G actually require?".
export interface KappaDistribution {
  /** rung index → number of nodes whose κ* is that rung. */
  byRung: Record<number, number>;
  /** Nodes that closed at some rung (kappa !== null). */
  closed: number;
  /** Nodes that never closed within the observed ladder. */
  neverClosed: number;
}

export function kappaDistribution(kappas: readonly (number | null)[]): KappaDistribution {
  const byRung: Record<number, number> = {};
  let closed = 0;
  let neverClosed = 0;
  for (const k of kappas) {
    if (k === null) {
      neverClosed++;
      continue;
    }
    byRung[k] = (byRung[k] ?? 0) + 1;
    closed++;
  }
  return { byRung, closed, neverClosed };
}
