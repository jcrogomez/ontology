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
  // docs/legend/CONTEXT_GLUING_REGIMES.md).
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
    },
    conflicts,
    warnings,
  };
}
