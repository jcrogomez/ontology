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

export function glueFragments(fragments: ContextFragment[]): GluingResult {
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
    if (nodeIds.size > 1) {
      conflicts.push({
        type: "duplicate_provider",
        message: `Duplicate provider for key: ${key}`,
        nodeIds: Array.from(nodeIds).sort(),
      });
    }
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
