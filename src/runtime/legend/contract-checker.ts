import { parseTypeScriptFile } from "../static/typescript.js";
import { RESOLVED_SIGNATURE_PREFIX } from "../static/typescript-resolved.js";
import type { ContractState } from "./matrix.js";

// Contract-axis checker v0 — cartography column 3.
// Spec: docs/design/inverse/CONTRACT_AXIS_CHECKER_SPEC.md. $0 by construction:
// pure static comparison of the node's DECLARED contract
// (context.provides keys + O1 signatures) against the regen artifact's
// extracted exports (syntactic tier). No LLM, no execution.
//
// Conservative direction (spec §3): this checker issues a VIOLATION
// verdict, so unknown ⇒ do-not-accuse — an incomparable signature
// (resolved-tier declaration, unannotated regen export) never produces
// a `fail`; only a missing key or a comparable-and-different signature
// does. The reverse of gluing's unknown ⇒ conflict, on purpose.

export interface DeclaredProvision {
  key: string;
  signature?: string;
}

export interface ContractCheckResult {
  nodeId: string;
  state: ContractState;
  /** Machine-greppable summary: "satisfied", "no_regen", "no_declared_contract", "unparseable_language", "parse_failed", "missing_keys", "signature_drift", "missing_keys+signature_drift". */
  reason: string;
  /** Declared keys absent from the regen's exports. */
  missingKeys: string[];
  /** Keys whose comparable signatures differ. */
  driftedKeys: Array<{ key: string; declared: string; measured: string }>;
  /** Keys checked presence-only (resolved-tier declaration or unannotated regen export). */
  incomparableKeys: string[];
  /** Number of declared keys evaluated. */
  checkedKeys: number;
}

const PARSEABLE = /\.(ts|tsx|js|jsx)$/;

export function checkContract(args: {
  nodeId: string;
  declared: readonly DeclaredProvision[];
  /** Regen artifact text; undefined when no artifact exists. */
  regenText: string | undefined;
  /** Regen file name/path — decides the parser's script kind. */
  regenFileName: string;
}): ContractCheckResult {
  const base = {
    nodeId: args.nodeId,
    missingKeys: [] as string[],
    driftedKeys: [] as Array<{ key: string; declared: string; measured: string }>,
    incomparableKeys: [] as string[],
    checkedKeys: args.declared.length,
  };

  if (args.regenText === undefined) {
    return { ...base, state: "not-measured", reason: "no_regen" };
  }
  if (args.declared.length === 0) {
    // POSITIONING's `contract-missing`: nothing was promised, so
    // nothing can be checked. verdictDerivedTags maps this to the
    // contract-missing frontier tag downstream.
    return { ...base, state: "unknown", reason: "no_declared_contract" };
  }
  if (!PARSEABLE.test(args.regenFileName)) {
    return { ...base, state: "unknown", reason: "unparseable_language" };
  }

  let exportsByName: Map<string, { signature?: string }>;
  try {
    const parsed = parseTypeScriptFile(args.regenFileName, args.regenText);
    exportsByName = new Map(
      parsed.exports
        .filter((e) => !e.isDefault)
        .map((e) => [e.name, e.signature !== undefined ? { signature: e.signature } : {}]),
    );
  } catch {
    // A regen that does not parse cannot demonstrate contract
    // satisfaction — but a parse failure is the structural axis's
    // finding, not a contract violation. Unknown, not fail (spec §2).
    return { ...base, state: "unknown", reason: "parse_failed" };
  }

  for (const p of args.declared) {
    const found = exportsByName.get(p.key);
    if (!found) {
      base.missingKeys.push(p.key);
      continue;
    }
    if (p.signature === undefined) continue; // presence-only declaration
    if (p.signature.startsWith(RESOLVED_SIGNATURE_PREFIX)) {
      // Resolved-tier declaration vs syntactic measurement: the tiers
      // must never be string-compared (typescript-resolved.ts header).
      base.incomparableKeys.push(p.key);
      continue;
    }
    if (found.signature === undefined) {
      // Unannotated regen export: maybe identical code without the
      // written annotation. Cannot compare ⇒ do not accuse.
      base.incomparableKeys.push(p.key);
      continue;
    }
    if (found.signature !== p.signature) {
      base.driftedKeys.push({
        key: p.key,
        declared: p.signature,
        measured: found.signature,
      });
    }
  }

  const missing = base.missingKeys.length > 0;
  const drifted = base.driftedKeys.length > 0;
  if (!missing && !drifted) {
    return { ...base, state: "pass", reason: "satisfied" };
  }
  const reason =
    missing && drifted
      ? "missing_keys+signature_drift"
      : missing
        ? "missing_keys"
        : "signature_drift";
  return { ...base, state: "fail", reason };
}
