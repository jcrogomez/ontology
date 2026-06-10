import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  buildMerkleTree,
  diffMerkleTrees,
  hashFileContent,
  normalizeLeafPath,
  type MerkleLeafInput,
} from "../src/core/integrity/merkle.js";

// Unit + property coverage for the Merkle module behind `onto drift`.
// The properties are the load-bearing part: the drift report is only
// trustworthy if the tree is deterministic under input order and the diff
// recovers EXACTLY the mutated paths — no more, no less.

describe("merkle — unit", () => {
  it("hashFileContent is a plain sha256 hex digest", () => {
    expect(hashFileContent("hello")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashFileContent("hello")).toBe(hashFileContent(Buffer.from("hello")));
    expect(hashFileContent("hello")).not.toBe(hashFileContent("hello!"));
  });

  it("normalizeLeafPath strips ./ prefixes and backslashes", () => {
    expect(normalizeLeafPath("./src/a.ts")).toBe("src/a.ts");
    expect(normalizeLeafPath("src\\a.ts")).toBe("src/a.ts");
    expect(normalizeLeafPath("/src/a.ts")).toBe("src/a.ts");
  });

  it("an empty leaf set builds a tree with zero leaves and a stable root", () => {
    const a = buildMerkleTree([]);
    const b = buildMerkleTree([]);
    expect(a.leafCount).toBe(0);
    expect(a.rootHash).toBe(b.rootHash);
  });

  it("duplicate leaf paths are an error, not a silent merge", () => {
    expect(() =>
      buildMerkleTree([
        { path: "src/a.ts", hash: "h1" },
        { path: "./src/a.ts", hash: "h2" },
      ]),
    ).toThrow(/duplicate leaf path/);
  });

  it("a name used as both file and directory is an error", () => {
    expect(() =>
      buildMerkleTree([
        { path: "src", hash: "h1" },
        { path: "src/a.ts", hash: "h2" },
      ]),
    ).toThrow(/path conflict/);
  });

  it("diff of a tree against itself is empty", () => {
    const tree = buildMerkleTree([
      { path: "src/a.ts", hash: "h1" },
      { path: "src/deep/b.ts", hash: "h2" },
    ]);
    expect(diffMerkleTrees(tree, tree)).toEqual({ added: [], removed: [], changed: [] });
  });

  it("a file replaced by a directory of the same name reports removed + added", () => {
    const prev = buildMerkleTree([{ path: "src/x", hash: "h1" }]);
    const next = buildMerkleTree([{ path: "src/x/inner.ts", hash: "h2" }]);
    const diff = diffMerkleTrees(prev, next);
    expect(diff.removed).toEqual(["src/x"]);
    expect(diff.added).toEqual(["src/x/inner.ts"]);
    expect(diff.changed).toEqual([]);
  });
});

// ── Properties ───────────────────────────────────────────────────────────────

const SEGMENTS = ["src", "core", "legend", "deep", "a", "b", "c"] as const;
const FILES = ["one.ts", "two.ts", "three.py", "four.md"] as const;

const arbPath: fc.Arbitrary<string> = fc
  .tuple(
    fc.array(fc.constantFrom(...SEGMENTS), { maxLength: 3 }),
    fc.constantFrom(...FILES),
  )
  .map(([dirs, file]) => [...dirs, file].join("/"));

const arbLeaves: fc.Arbitrary<MerkleLeafInput[]> = fc
  .uniqueArray(arbPath, { minLength: 1, maxLength: 12 })
  // Filter out file/dir conflicts (a path equal to a prefix of another).
  .filter((paths) => {
    const set = new Set(paths);
    return paths.every((p) => {
      const segs = p.split("/");
      for (let i = 1; i < segs.length; i++) {
        if (set.has(segs.slice(0, i).join("/"))) return false;
      }
      return true;
    });
  })
  .chain((paths) =>
    fc
      .array(fc.string({ unit: fc.constantFrom(..."0123456789abcdef"), minLength: 8, maxLength: 8 }), {
        minLength: paths.length,
        maxLength: paths.length,
      })
      .map((hashes) => paths.map((p, i) => ({ path: p, hash: hashes[i] }))),
  );

describe("merkle — properties", () => {
  it("input order never changes the tree: any permutation has the same root", () => {
    fc.assert(
      fc.property(
        arbLeaves.chain((leaves) =>
          fc.tuple(
            fc.constant(leaves),
            fc.shuffledSubarray(leaves, {
              minLength: leaves.length,
              maxLength: leaves.length,
            }),
          ),
        ),
        ([leaves, shuffled]) => {
          expect(buildMerkleTree(shuffled).rootHash).toBe(buildMerkleTree(leaves).rootHash);
        },
      ),
    );
  });

  it("changing exactly one leaf hash changes the root and diffs to exactly that path", () => {
    fc.assert(
      fc.property(
        arbLeaves.chain((leaves) =>
          fc.tuple(fc.constant(leaves), fc.nat({ max: leaves.length - 1 })),
        ),
        ([leaves, idx]) => {
          const mutated = leaves.map((l, i) =>
            i === idx ? { ...l, hash: `${l.hash}_x` } : l,
          );
          const prev = buildMerkleTree(leaves);
          const next = buildMerkleTree(mutated);
          expect(next.rootHash).not.toBe(prev.rootHash);
          expect(diffMerkleTrees(prev, next)).toEqual({
            added: [],
            removed: [],
            changed: [normalizeLeafPath(leaves[idx].path)],
          });
        },
      ),
    );
  });

  it("removing a subset of leaves diffs to exactly that subset as removed", () => {
    fc.assert(
      fc.property(
        arbLeaves
          .filter((l) => l.length >= 2)
          .chain((leaves) =>
            fc.tuple(
              fc.constant(leaves),
              fc.shuffledSubarray(leaves, { minLength: 1, maxLength: leaves.length - 1 }),
            ),
          ),
        ([leaves, removedSubset]) => {
          const removedPaths = new Set(removedSubset.map((l) => l.path));
          const remaining = leaves.filter((l) => !removedPaths.has(l.path));
          const diff = diffMerkleTrees(buildMerkleTree(leaves), buildMerkleTree(remaining));
          expect(diff.added).toEqual([]);
          expect(diff.changed).toEqual([]);
          expect(diff.removed).toEqual(
            removedSubset.map((l) => normalizeLeafPath(l.path)).sort(),
          );
        },
      ),
    );
  });

  it("diff is anti-symmetric: swapping prev/next swaps added and removed", () => {
    fc.assert(
      fc.property(arbLeaves, arbLeaves, (a, b) => {
        const ta = buildMerkleTree(a);
        const tb = buildMerkleTree(b);
        const forward = diffMerkleTrees(ta, tb);
        const backward = diffMerkleTrees(tb, ta);
        expect(backward.added).toEqual(forward.removed);
        expect(backward.removed).toEqual(forward.added);
        expect(backward.changed).toEqual(forward.changed);
      }),
    );
  });

  it("identical leaf sets are indistinguishable: same root, empty diff", () => {
    fc.assert(
      fc.property(arbLeaves, (leaves) => {
        const a = buildMerkleTree(leaves);
        const b = buildMerkleTree([...leaves].reverse());
        expect(a.rootHash).toBe(b.rootHash);
        expect(diffMerkleTrees(a, b)).toEqual({ added: [], removed: [], changed: [] });
      }),
    );
  });
});
