import type { ContextFragment } from "./presheaf.js";

export type GluingConflictType =
  | "missing_requirement"
  | "forbidden_match"
  | "duplicate_provider"
  | "branch_mismatch";

export interface GluingConflict {
  type: GluingConflictType;
  message: string;
  nodeIds: string[];
}

export interface GluingResult {
  ok: boolean;
  merged: ContextFragment;
  conflicts: GluingConflict[];
  warnings: string[];
}

export interface GluingOptions {
  // How to treat two DISTINCT nodes providing the same key (O2,
  // docs/design/laws/CONTEXT_GLUING_REGIMES.md).
  //   "conflict" (default) — provider-uniqueness: always a
  //     `duplicate_provider` conflict. This is the separated-presheaf
  //     behaviour the Axiom 5 ledger pins; every existing caller uses it.
  //   "identify-if-equal" — sheaf-on-identical-overlaps: two providers of
  //     the same key are IDENTIFIED (glued, no conflict) iff they carry an
  //     identical, defined syntactic signature (`fragment.provideSignatures`).
  //     A missing signature on either side, or differing signatures (drift),
  //     still conflicts — conservative by construction: unknown ⇒ conflict,
  //     never a false identification.
  onDuplicateProvider?: "conflict" | "identify-if-equal";
}

export function glueFragments(
  fragments: ContextFragment[],
  options: GluingOptions = {},
): GluingResult {
  const onDuplicateProvider = options.onDuplicateProvider ?? "conflict";
  if (fragments.length === 0) {
    return {
      ok: true,
      merged: {
        nodeId: "merged",
        branch: "main",
        provides: [],
        requires: [],
        forbids: [],
        optional: [],
        rules: [],
      },
      conflicts: [],
      warnings: ["No context fragments provided."],
    };
  }

  const conflicts: GluingConflict[] = [];
  const warnings: string[] = [];

  const branches = new Set(fragments.map((f) => f.branch));
  if (branches.size > 1) {
    conflicts.push({
      type: "branch_mismatch",
      message: "Fragments belong to different branches.",
      nodeIds: fragments.map((f) => f.nodeId),
    });
  }

  const baseBranch = fragments[0].branch;

  const providesMap = new Map<string, Set<string>>();
  for (const fragment of fragments) {
    for (const key of fragment.provides) {
      if (!providesMap.has(key)) {
        providesMap.set(key, new Set());
      }
      providesMap.get(key)!.add(fragment.nodeId);
    }
  }

  for (const [key, nodeIds] of providesMap.entries()) {
    if (nodeIds.size <= 1) continue;

    // Multiple distinct providers of `key`. Under "identify-if-equal", glue
    // them iff every provider declares the SAME, defined signature for the
    // key — that is the precise sense in which agreeing local sections glue
    // to one global section (a sheaf on the identical-overlap subcategory).
    if (onDuplicateProvider === "identify-if-equal") {
      const sigs = fragments
        .filter((f) => f.provides.includes(key))
        .map((f) => f.provideSignatures?.[key]);
      const allDefined = sigs.every((s) => s !== undefined);
      const allEqual = sigs.every((s) => s === sigs[0]);
      if (allDefined && allEqual) {
        warnings.push(
          `Identified ${nodeIds.size} providers of key "${key}" by equal signature.`,
        );
        continue; // identified — no conflict
      }
      // fall through: missing or differing signature ⇒ conflict (drift /
      // unknown is never silently identified)
    }

    conflicts.push({
      type: "duplicate_provider",
      message: `Duplicate provider for key: ${key}`,
      nodeIds: Array.from(nodeIds).sort(),
    });
  }

  const allProvides = new Set<string>();
  const allRequires = new Set<string>();
  const allForbids = new Set<string>();
  const allOptional = new Set<string>();
  const allRules = new Set<string>();

  for (const fragment of fragments) {
    fragment.provides.forEach((v: string) => allProvides.add(v));
    fragment.requires.forEach((v: string) => allRequires.add(v));
    fragment.forbids.forEach((v: string) => allForbids.add(v));
    fragment.optional.forEach((v: string) => allOptional.add(v));
    fragment.rules.forEach((v: string) => allRules.add(v));
  }

  for (const req of allRequires) {
    if (!allProvides.has(req)) {
      const missingNodes = fragments
        .filter((f) => f.requires.includes(req))
        .map((f) => f.nodeId)
        .sort();
      conflicts.push({
        type: "missing_requirement",
        message: `Missing requirement: ${req}`,
        nodeIds: missingNodes,
      });
    }
  }

  for (const forbid of allForbids) {
    if (allProvides.has(forbid)) {
      const forbiddingNodes = fragments
        .filter((f) => f.forbids.includes(forbid))
        .map((f) => f.nodeId);
      const providingNodes = fragments
        .filter((f) => f.provides.includes(forbid))
        .map((f) => f.nodeId);

      conflicts.push({
        type: "forbidden_match",
        message: `Forbidden match found for key: ${forbid}`,
        nodeIds: Array.from(new Set([...forbiddingNodes, ...providingNodes])).sort(),
      });
    }
  }

  // The glued section carries the identified signature per provided key, so
  // it is a COMPLETE section (the sheaf gluing axiom's "global section"): a
  // restriction of it can recover each piece. Under identify-if-equal the
  // contributors agree, so the first defined signature is canonical; under
  // the default policy a duplicate already fails (ok=false), so this is only
  // load-bearing on a successful glue.
  const mergedSignatures: Record<string, string> = {};
  for (const key of allProvides) {
    for (const f of fragments) {
      const sig = f.provideSignatures?.[key];
      if (sig !== undefined) {
        mergedSignatures[key] = sig;
        break;
      }
    }
  }

  return {
    ok: conflicts.length === 0,
    merged: {
      nodeId: "merged",
      branch: baseBranch,
      provides: Array.from(allProvides).sort(),
      requires: Array.from(allRequires).sort(),
      forbids: Array.from(allForbids).sort(),
      optional: Array.from(allOptional).sort(),
      rules: Array.from(allRules).sort(),
      ...(Object.keys(mergedSignatures).length > 0
        ? { provideSignatures: mergedSignatures }
        : {}),
    },
    conflicts,
    warnings,
  };
}

// ── Restriction map (sheaf structure, Path-to-T1 gate #2) ─────────────────────
//
// The presheaf restriction map for the gluing object: F(U) → F(U_i). Given a
// (typically glued) section and a `piece` of the cover, return the part of the
// section that lies over the piece's domain — the provides/requires/forbids/
// optional/rules the piece deals with. This is the map that was *implicit*
// (and kept the gluing claim at T2): naming it lets the sheaf gluing axiom be
// stated as a law — a compatible family glues to a section that *restricts
// back* to each piece. See `tests/presheaf-sheaf-laws.test.ts` Part 3.
export function restrictSection(
  section: ContextFragment,
  piece: ContextFragment,
): ContextFragment {
  const keep = (from: string[], domain: string[]): string[] => {
    const set = new Set(domain);
    return from.filter((x) => set.has(x));
  };
  const provides = keep(section.provides, piece.provides);
  const provideSignatures: Record<string, string> = {};
  for (const k of provides) {
    const sig = section.provideSignatures?.[k];
    if (sig !== undefined) provideSignatures[k] = sig;
  }
  return {
    nodeId: piece.nodeId,
    branch: piece.branch,
    provides,
    requires: keep(section.requires, piece.requires),
    forbids: keep(section.forbids, piece.forbids),
    optional: keep(section.optional, piece.optional),
    rules: keep(section.rules, piece.rules),
    ...(Object.keys(provideSignatures).length > 0 ? { provideSignatures } : {}),
  };
}
