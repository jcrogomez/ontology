// `onto query` — representable-functor (Yoneda) search over the typed
// multigraph. Wired into the top-level commander program in src/cli.ts.

import type { Command } from "commander";
import { errorMessage } from "../../core/errors.js";
import { runQueryCommand } from "./run-query.js";

// Registers the `onto query` verb. Kept as a single registrar function so
// src/cli.ts only adds one import and one call — minimizing the surface
// area of changes in the central wiring file.
export function registerQueryCommand(program: Command): void {
  program
    .command("query")
    .description("Find nodes by Yoneda profile (a partial Hom-profile of properties and edges).")
    .option("--shape <json>", "Query shape as a JSON object literal (mutually exclusive with --shape-file)")
    .option("--shape-file <path>", "Read the query shape from a JSON file (mutually exclusive with --shape)")
    .option("--kind <list>", "Comma-separated node kinds to match (any-of)")
    .option("--abstraction <list>", "Comma-separated abstraction levels to match (any-of)")
    .option("--plane <list>", "Comma-separated planes to match (any-of)")
    .option("--manifestation <list>", "Comma-separated manifestations to match (any-of)")
    .option("--status <list>", "Comma-separated statuses to match (any-of)")
    .option("--branch <branch>", "Exact branch match")
    .option("--provides <list>", "Concept keys the node MUST provide (all-of)")
    .option("--requires <list>", "Concept sources the node MUST require (all-of)")
    .option("--forbids <list>", "Concept sources the node MUST forbid (all-of)")
    .option("--has-incoming <types>", "Edge types the node MUST have incoming, all-of (comma-separated)")
    .option("--has-outgoing <types>", "Edge types the node MUST have outgoing, all-of (comma-separated)")
    .option("--semantic <text>", "Hybrid retrieval: re-rank the structural matches by cosine similarity against the local embedding index (requires `onto semantic index`)")
    .option("--top <n>", "With --semantic: keep the N best-scoring matches (default 10)")
    .option("--min-score <x>", "With --semantic: drop matches scoring below x")
    .option("--json", "Output full node objects as JSON instead of the pretty table")
    .action(async (options) => {
      try {
        await runQueryCommand(options);
      } catch (err: unknown) {
        if (options.json) {
          console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
        } else {
          console.error(`✖ Error during query: ${errorMessage(err)}`);
        }
        process.exit(1);
      }
    });
}
