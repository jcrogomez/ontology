// The run governor — B1/B2 (MVP_REGEN_LOOP.md §4.1): a spend budget + dead-
// provider failover for one executor run. Runner-level by design: the pure
// policy never sees it (no new Terminal, no taxonomy surgery) — the governor
// shapes which rungs a node's climb can SEE, and the report says so honestly.
//
// Two mechanisms, both measured-fact-honest (LADDER_ECONOMICS §3: no
// fabricated dollars):
//
//   1. Cloud-attempt budget. `maxCloudAttempts` caps how many attempts the
//      whole run may dispatch at cloud-locality rungs. When it runs out, cloud
//      rungs disappear from the effective ladder of every LATER node (their
//      climbs plateau honestly on local capacity); an attempt already mid-node
//      that would land on cloud terminates that node as infra-error with an
//      explicit budget detail — a resource condition, not a model verdict.
//
//   2. Dead-provider marking. An infra verdict whose detail matches the
//      dead/exhausted-provider family (connection refused, quota, rate limit)
//      marks that PROVIDER dead for the rest of the run: later nodes skip its
//      rungs instead of re-burning a timeout each (the observed 2026-07-07
//      failure shape: the Ollama-down sweep and the cloud-quota re-run).
//
// The effective ladder never reorders — it filters. Rung indices in a node's
// record index into the EFFECTIVE ladder that node climbed (each NodeRecord
// already carries its own locality accounting, so cross-node comparison stays
// coherent).

import { rungLocality, type LadderRung } from "./model-ladder.js";
import type { ResolvedNodeModel } from "../llm/resolve-node-model.js";
import type { GateVerdict } from "./verdict.js";

/** The dead/exhausted-provider family — the same evidence class verdict.ts's
 *  legacy sniffing recognises, scoped here to RUN-level failover. */
const DEAD_PROVIDER = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|usage limit|rate limit|too many requests|quota|status code 429|provider.*down/i;

export interface GovernorConfig {
  /** Max attempts the run may dispatch at cloud-locality rungs. undefined =
   *  unlimited (the pre-governor behaviour, byte-compatible). */
  maxCloudAttempts?: number;
}

export interface GovernorSummary {
  maxCloudAttempts: number | null;
  cloudAttemptsUsed: number;
  /** Providers marked dead during the run, with the first evidence line. */
  deadProviders: { provider: string; evidence: string }[];
  /** True when the budget ran out at least once (some node saw a truncated
   *  ladder or was cut mid-climb). */
  budgetExhausted: boolean;
}

export type Rung = ResolvedNodeModel | LadderRung;

export class RunGovernor {
  private readonly max: number | undefined;
  private used = 0;
  private readonly dead = new Map<string, string>();
  private exhaustedSeen = false;

  constructor(config: GovernorConfig = {}) {
    this.max = config.maxCloudAttempts;
  }

  private isCloud(rung: Rung): boolean {
    return rungLocality(rung as LadderRung) === "cloud";
  }

  private budgetLeft(): boolean {
    return this.max === undefined || this.used < this.max;
  }

  /** The rungs a node starting NOW may climb: dead providers filtered always;
   *  cloud rungs filtered once the budget is spent. Order preserved. */
  effectiveLadder(ladder: readonly Rung[]): Rung[] {
    const out = ladder.filter((r) => !this.dead.has(r.provider));
    if (this.budgetLeft()) return out;
    const local = out.filter((r) => !this.isCloud(r));
    if (local.length < out.length) this.exhaustedSeen = true;
    return local;
  }

  /** Gate one attempt about to dispatch at `rung`. `allowed: false` means the
   *  cloud budget is spent — the caller must not dispatch. */
  noteAttempt(rung: Rung): { allowed: boolean; detail?: string } {
    if (!this.isCloud(rung)) return { allowed: true };
    if (!this.budgetLeft()) {
      this.exhaustedSeen = true;
      return {
        allowed: false,
        detail: `cloud attempt budget exhausted (${this.used}/${this.max}) — rung ${rung.provider}${rung.model ? `:${rung.model}` : ""} not dispatched`,
      };
    }
    this.used += 1;
    return { allowed: true };
  }

  /** Fold one attempt's verdict: a dead/exhausted-provider infra failure marks
   *  the provider dead for the rest of the run. */
  noteVerdict(rung: Rung, verdict: Pick<GateVerdict, "outcome" | "detail">): void {
    if (verdict.outcome !== "infra-error") return;
    if (!DEAD_PROVIDER.test(verdict.detail)) return;
    if (!this.dead.has(rung.provider)) this.dead.set(rung.provider, verdict.detail);
  }

  summary(): GovernorSummary {
    return {
      maxCloudAttempts: this.max ?? null,
      cloudAttemptsUsed: this.used,
      deadProviders: [...this.dead.entries()].map(([provider, evidence]) => ({ provider, evidence })),
      budgetExhausted: this.exhaustedSeen,
    };
  }
}
