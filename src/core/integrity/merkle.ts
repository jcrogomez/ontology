import { createHash } from "node:crypto";
import stringify from "fast-json-stable-stringify";

// Merkle tree over a set of (path, contentHash) leaves — the change-detection
// primitive behind `onto drift`.
//
// Why a tree and not a flat hash list: comparing two snapshots descends only
// into directories whose combined fingerprint differs, so an unchanged
// subtree is dismissed in O(1) regardless of how many files it holds. With
// today's ~125-artifact perimeter the asymptotic win is modest; the tree
// shape is kept because it is the part that scales (and it matches the
// kernel's ethos: a fingerprint per region, composable upward).
//
// Determinism contract (same as hash.ts): identical leaf sets — in ANY input
// order — produce byte-identical trees and the same root hash. Paths are
// normalised to posix separators; duplicates are an error, not a silent
// merge. This module is pure: no filesystem access, callers hash file
// contents themselves (see `hashFileContent`).

export interface MerkleLeafInput {
  /** cwd-relative path, "/" or "\\" separated; normalised internally. */
  path: string;
  /** Content hash of the file (hex). Any stable digest works. */
  hash: string;
}

export interface MerkleLeafNode {
  kind: "leaf";
  name: string;
  hash: string;
}

export interface MerkleDirNode {
  kind: "dir";
  name: string;
  hash: string;
  children: MerkleChildNode[];
}

export type MerkleChildNode = MerkleDirNode | MerkleLeafNode;

export interface MerkleTree {
  rootHash: string;
  root: MerkleDirNode;
  leafCount: number;
}

export interface MerkleDiff {
  /** Paths present in `next` but not in `prev`. */
  added: string[];
  /** Paths present in `prev` but not in `next`. */
  removed: string[];
  /** Paths present in both with differing content hashes. */
  changed: string[];
}

/** sha256 hex of raw file bytes — the leaf-hash helper for callers. */
export function hashFileContent(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function normalizeLeafPath(p: string): string {
  let out = p.replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
  return out.replace(/^\/+/, "");
}

interface MutableDir {
  dirs: Map<string, MutableDir>;
  leaves: Map<string, string>; // name → hash
}

function hashDir(children: Array<["dir" | "leaf", string, string]>): string {
  // Children arrive pre-sorted by name; the triple [kind, name, hash] makes a
  // dir-vs-file swap at the same name produce a different fingerprint.
  return createHash("sha256").update(stringify(children)).digest("hex");
}

function freezeDir(name: string, dir: MutableDir): MerkleDirNode {
  const childNames = [
    ...Array.from(dir.dirs.keys()),
    ...Array.from(dir.leaves.keys()),
  ].sort();
  const children: MerkleChildNode[] = [];
  for (const child of childNames) {
    const sub = dir.dirs.get(child);
    if (sub !== undefined) {
      children.push(freezeDir(child, sub));
    } else {
      children.push({ kind: "leaf", name: child, hash: dir.leaves.get(child)! });
    }
  }
  const hash = hashDir(children.map((c) => [c.kind, c.name, c.hash]));
  return { kind: "dir", name, hash, children };
}

export function buildMerkleTree(leaves: ReadonlyArray<MerkleLeafInput>): MerkleTree {
  const root: MutableDir = { dirs: new Map(), leaves: new Map() };
  let leafCount = 0;
  for (const leaf of leaves) {
    const normalized = normalizeLeafPath(leaf.path);
    if (normalized.length === 0) {
      throw new Error("merkle: empty leaf path");
    }
    const segments = normalized.split("/").filter((s) => s.length > 0);
    const name = segments.pop()!;
    let cursor = root;
    for (const segment of segments) {
      if (cursor.leaves.has(segment)) {
        throw new Error(`merkle: path conflict — "${segment}" is both a file and a directory`);
      }
      let next = cursor.dirs.get(segment);
      if (!next) {
        next = { dirs: new Map(), leaves: new Map() };
        cursor.dirs.set(segment, next);
      }
      cursor = next;
    }
    if (cursor.dirs.has(name)) {
      throw new Error(`merkle: path conflict — "${name}" is both a file and a directory`);
    }
    if (cursor.leaves.has(name)) {
      throw new Error(`merkle: duplicate leaf path "${normalized}"`);
    }
    cursor.leaves.set(name, leaf.hash);
    leafCount += 1;
  }
  const frozen = freezeDir("", root);
  return { rootHash: frozen.hash, root: frozen, leafCount };
}

function collectPaths(node: MerkleChildNode, prefix: string, out: string[]): void {
  const here = prefix.length === 0 ? node.name : `${prefix}/${node.name}`;
  if (node.kind === "leaf") {
    out.push(here);
    return;
  }
  for (const child of node.children) collectPaths(child, here, out);
}

function diffDirs(prev: MerkleDirNode, next: MerkleDirNode, prefix: string, diff: MerkleDiff): void {
  // The Merkle prune: identical fingerprints ⇒ identical subtrees, skip.
  if (prev.hash === next.hash) return;
  const prevByName = new Map(prev.children.map((c) => [c.name, c]));
  const nextByName = new Map(next.children.map((c) => [c.name, c]));
  const names = Array.from(new Set([...prevByName.keys(), ...nextByName.keys()])).sort();
  for (const name of names) {
    const a = prevByName.get(name);
    const b = nextByName.get(name);
    const here = prefix.length === 0 ? name : `${prefix}/${name}`;
    if (a && !b) {
      collectPaths(a, prefix, diff.removed);
    } else if (!a && b) {
      collectPaths(b, prefix, diff.added);
    } else if (a && b) {
      if (a.kind === "leaf" && b.kind === "leaf") {
        if (a.hash !== b.hash) diff.changed.push(here);
      } else if (a.kind === "dir" && b.kind === "dir") {
        diffDirs(a, b, here, diff);
      } else {
        // A file became a directory (or vice versa): every old path under the
        // name is gone, every new path under it is new.
        collectPaths(a, prefix, diff.removed);
        collectPaths(b, prefix, diff.added);
      }
    }
  }
}

export function diffMerkleTrees(prev: MerkleTree, next: MerkleTree): MerkleDiff {
  const diff: MerkleDiff = { added: [], removed: [], changed: [] };
  diffDirs(prev.root, next.root, "", diff);
  diff.added.sort();
  diff.removed.sort();
  diff.changed.sort();
  return diff;
}
