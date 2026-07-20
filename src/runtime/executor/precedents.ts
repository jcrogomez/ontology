// Episodic precedent store — the executor's memory of how each node's last
// governed run ENDED, keyed to the ficha content that produced it.
//
// Why it exists: without memory, every `onto execute` re-burns the whole
// lever/ladder space per node, including nodes a prior run already proved to
// be extraction-gaps ("the intention is the limit"). Re-running the ladder on
// an UNCHANGED ficha cannot change that verdict — the honest, cheap move is
// to cite the precedent and route the node to ficha repair again. The moment
// the ficha changes (or the ladder grows taller), the precedent is void and
// the node earns a fresh climb. Closed nodes contribute the other half: their
// κ* persists across runs, so the warm start (least-element search from a
// known lower bound) survives the process instead of living in one config.
//
// What this is NOT: a verification cache. Precedents never green-light a
// write — `closed` precedents only pick the STARTING rung; the gates run in
// full every time. Only the plateau verdict `extraction-gap` short-circuits,
// because it is precisely the verdict that re-running cannot improve.
// (Capacity-ceiling deliberately does NOT short-circuit: the local F is
// high-variance — P1_COLLAPSE_VARIANCE — so a fresh climb can legitimately
// close what last run's draws missed.)
//
// The ficha hash covers exactly the intent surface the forward functor
// consumes (prompt + rules + context contract) — a rename of an unrelated
// node field must not void precedents.

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { loadNodeById } from "../../kernel/core/project/load.js";
import { getOntologyPaths } from "../../kernel/core/project/paths.js";
import type { PlateauEvidence, Terminal } from "./types.js";

export interface NodePrecedent {
  nodeId: string;
  /** sha256 over the node's intent surface (prompt, rules, context) at the
   *  time of the run. A mismatch voids the precedent. */
  fichaHash: string;
  terminal: Terminal;
  /** κ* when the node closed; null otherwise. */
  kappa: number | null;
  gapEvidence?: PlateauEvidence;
  /** Ladder height when recorded. A TALLER current ladder voids a plateau
   *  precedent (there is new capacity the prior run never tried). */
  ladderSize: number;
  recordedAt: string;
}

export interface PrecedentStore {
  /** The node's precedent IF still valid (ficha unchanged); else undefined. */
  lookup(nodeId: string): NodePrecedent | undefined;
  record(p: Omit<NodePrecedent, "fichaHash" | "recordedAt">): void;
}

interface PrecedentFile {
  version: 1;
  nodes: Record<string, NodePrecedent>;
}

export function precedentsPath(cwd: string): string {
  return path.join(getOntologyPaths(cwd).reportsDir, "executor-precedents.json");
}

/** Hash of the intent surface F consumes. undefined when the node cannot be
 *  loaded (then no precedent can be validated or recorded — fail open). */
export function fichaHashFor(nodeId: string, cwd: string): string | undefined {
  try {
    const node = loadNodeById(nodeId, cwd);
    if (!node) return undefined;
    const surface = JSON.stringify([node.prompt ?? null, node.rules ?? [], node.context ?? null]);
    return createHash("sha256").update(surface).digest("hex");
  } catch {
    return undefined;
  }
}

function readFile(cwd: string): Record<string, NodePrecedent> {
  try {
    const parsed = JSON.parse(fs.readFileSync(precedentsPath(cwd), "utf-8")) as PrecedentFile;
    return parsed.nodes ?? {};
  } catch {
    return {};
  }
}

export function createPrecedentStore(cwd: string): PrecedentStore {
  return {
    lookup(nodeId: string): NodePrecedent | undefined {
      const p = readFile(cwd)[nodeId];
      if (!p) return undefined;
      const hash = fichaHashFor(nodeId, cwd);
      // Fail open on an unhashable ficha: no citation without a match.
      if (hash === undefined || hash !== p.fichaHash) return undefined;
      return p;
    },
    record(p: Omit<NodePrecedent, "fichaHash" | "recordedAt">): void {
      const fichaHash = fichaHashFor(p.nodeId, cwd);
      if (fichaHash === undefined) return; // nothing citable without a hash
      const file: PrecedentFile = { version: 1, nodes: readFile(cwd) };
      file.nodes[p.nodeId] = { ...p, fichaHash, recordedAt: new Date().toISOString() };
      const target = precedentsPath(cwd);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(file, null, 2) + "\n", "utf-8");
    },
  };
}
