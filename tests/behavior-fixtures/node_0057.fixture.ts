import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0057 — src/runtime/topos/rule-compiler.ts
// Tested entry: compileNodeRules(node, neighborhood) — lifts requires/forbids
// arrays into a Predicate tree. The cases pin the vacuous-conjunction pTrue
// for empty input, intra-array de-duplication, and that `provides` is NOT
// injected into the tree — a regen could plausibly add a provides clause or
// nest redundant and(true, ...) wrappers.

type Predicate =
  | { tag: "atom"; atom: { tag: string; token: string } }
  | { tag: "and"; left: Predicate; right: Predicate }
  | { tag: "true" }
  | { tag: "false" };

type RuleApi = {
  compileNodeRules: (
    node: { requires?: string[]; provides?: string[]; forbids?: string[] },
    neighborhood: { providedTokens: ReadonlySet<string> },
  ) => Predicate;
};

export const cases: BehaviorCase[] = [
  {
    name: "compileNodeRules — no constraints compiles to the pTrue constant",
    setup: () => ({ node: {} }),
    invoke: (api, ctx) =>
      (api as RuleApi).compileNodeRules(
        (ctx as { node: Record<string, never> }).node,
        { providedTokens: new Set<string>() },
      ),
    assert: (r) => (r as Predicate).tag === "true",
  },
  {
    name: "compileNodeRules — duplicate requires collapse to a single bare atom",
    setup: () => ({ node: { requires: ["tok_t", "tok_t"] } }),
    invoke: (api, ctx) =>
      (api as RuleApi).compileNodeRules(
        (ctx as { node: { requires: string[] } }).node,
        { providedTokens: new Set<string>() },
      ),
    assert: (r) => {
      const v = r as Predicate;
      return (
        v.tag === "atom" &&
        v.atom.tag === "requires" &&
        v.atom.token === "tok_t"
      );
    },
  },
  {
    name: "compileNodeRules — requires and forbids conjoin; provides is ignored",
    setup: () => ({
      node: { requires: ["tok_a"], forbids: ["tok_b"], provides: ["tok_c"] },
    }),
    invoke: (api, ctx) =>
      (api as RuleApi).compileNodeRules(
        (ctx as { node: { requires: string[]; forbids: string[]; provides: string[] } }).node,
        { providedTokens: new Set<string>() },
      ),
    assert: (r) => {
      const v = r as Predicate;
      return (
        v.tag === "and" &&
        v.left.tag === "atom" &&
        v.left.atom.tag === "requires" &&
        v.right.tag === "atom" &&
        v.right.atom.tag === "forbids" &&
        !JSON.stringify(v).includes("tok_c")
      );
    },
  },
];
