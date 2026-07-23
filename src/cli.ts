#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { initCommand } from "./surfaces/commands/init.js";
import { doctorCommand } from "./surfaces/commands/doctor.js";
import { validateCommand } from "./surfaces/commands/validate.js";
import { replayCommand } from "./surfaces/commands/replay.js";
import { driftCommand } from "./surfaces/commands/drift.js";
import { semanticIndexCommand, semanticLinksCommand } from "./surfaces/commands/semantic/index.js";
import { inspectCommand } from "./surfaces/commands/inspect.js";
import { createNodeCommand } from "./surfaces/commands/node/create.js";
import { nodeListCommand } from "./surfaces/commands/node/list.js";
import { nodeShowCommand } from "./surfaces/commands/node/show.js";
import { nodeLinkCommand } from "./surfaces/commands/node/link.js";
import { nodeUpdateCommand } from "./surfaces/commands/node/update.js";
import { nodeInspectCommand } from "./surfaces/commands/node/inspect.js";
import { nodeRemoveCommand } from "./surfaces/commands/node/remove.js";
import { edgeRemoveCommand } from "./surfaces/commands/edge/remove.js";
import { edgeUpdateCommand } from "./surfaces/commands/edge/update.js";
import { eventsTailCommand } from "./surfaces/commands/events/tail.js";
import { contextAssembleCommand } from "./surfaces/commands/context/assemble.js";
import { runPromptCommand } from "./surfaces/commands/run/prompt.js";
import { runContextCommand } from "./surfaces/commands/run/context.js";
import { runsListCommand } from "./surfaces/commands/runs/list.js";
import { runsShowCommand } from "./surfaces/commands/runs/show.js";
import { runsVerifyCommand } from "./surfaces/commands/runs/verify.js";
import { walkCommand } from "./surfaces/commands/walk.js";
import { graphNeighborsCommand } from "./surfaces/commands/graph/neighbors.js";
import { graphPathCommand } from "./surfaces/commands/graph/path.js";
import { graphSubgraphCommand } from "./surfaces/commands/graph/subgraph.js";
import { graphInferEdgesCommand } from "./surfaces/commands/graph/infer-edges.js";
import { graphMetricsCommand } from "./surfaces/commands/graph/metrics.js";
import { graphHierarchizeCommand } from "./surfaces/commands/graph/hierarchize.js";
import { graphReadinessCommand } from "./surfaces/commands/graph/readiness.js";
import { graphMaterializeEdgesCommand } from "./surfaces/commands/graph/materialize-edges.js";
import { branchListCommand } from "./surfaces/commands/branch/list.js";
import { branchFiberCommand } from "./surfaces/commands/branch/fiber.js";
import { linkCommand } from "./surfaces/commands/link/index.js";
import { proposeNodeCommand } from "./surfaces/commands/proposal/propose-node.js";
import { proposeLinkCommand } from "./surfaces/commands/proposal/propose-link.js";
import { compilePlanCommand } from "./surfaces/commands/compile/plan.js";
import { compileRunCommand } from "./surfaces/commands/compile/run.js";
import { compileRunBatchCommand } from "./surfaces/commands/compile/run-batch.js";
import { ingestCommand } from "./surfaces/commands/ingest/index.js";
import { frontierCommand } from "./surfaces/commands/frontier/index.js";
import { proposalListCommand } from "./surfaces/commands/proposal/list.js";
import { proposalShowCommand } from "./surfaces/commands/proposal/show.js";
import { proposalRejectCommand } from "./surfaces/commands/proposal/reject.js";
import { proposalApplyCommand } from "./surfaces/commands/proposal/apply.js";
import { modelDoctorCommand } from "./surfaces/commands/model/doctor.js";
import { modelListCommand } from "./surfaces/commands/model/list.js";
import { registerQueryCommand } from "./surfaces/commands/query/index.js";
import { verifyHomeomorphismCommand } from "./surfaces/commands/verify/homeomorphism.js";
import { regenerateCommand } from "./surfaces/commands/regenerate.js";
import { syncCommand } from "./surfaces/commands/sync.js";
import { executeCommand } from "./surfaces/commands/execute.js";
import { repairCommand } from "./surfaces/commands/repair.js";
import { statusCommand } from "./surfaces/commands/status.js";
import { dodCommand } from "./surfaces/commands/dod.js";
import { probeCommand } from "./surfaces/commands/probe.js";
import { rulesCheckCommand, rulesAuditCommand } from "./surfaces/commands/rules.js";
import { fichaAuditCommand, fichaCleanupCommand } from "./surfaces/commands/ficha.js";
import { workflowRunCommand } from "./surfaces/commands/workflow/run.js";
import { openCommand } from "./surfaces/commands/open.js";
import { ontoMcpCommand } from "./surfaces/commands/mcp/index.js";
import { runBakeoffCommand } from "./surfaces/commands/bakeoff/index.js";
import { projectsListCommand } from "./surfaces/commands/projects/list.js";
import { projectsForgetCommand } from "./surfaces/commands/projects/forget.js";
import { errorMessage } from "./kernel/core/errors.js";

// Single source of truth for the version: package.json. Resolved relative to
// this module so it works both from src/ (tsx dev) and dist/ (built binary) —
// both live one level below the package root.
const require = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("onto")
  .description("Ontology CLI: terminal-first multidimensional intention network editor.")
  .version(PACKAGE_VERSION);

program
  .command("init")
  .description("Initializes a new Ontology Network Kernel. With --template <name>, seeds a starter intent-graph on top of the canon (replayed through the same kernel primitives as hand-authoring). Use --list-templates to see what's available.")
  .option("--name <name>", "Friendly name for the global project registry (defaults to the cwd basename)")
  .option("--template <name>", "#3: seed a starter intent-graph from templates/<name>.json (e.g. hello-world, rest-api, python-cli). Validated up front; a bad name fails before anything is written.")
  .option("--list-templates", "#3: print the available seed-graph templates and exit without initialising.")
  .action(async (options) => {
    try {
      await initCommand({ name: options.name, template: options.template, listTemplates: options.listTemplates });
    } catch (err: unknown) {
      console.error(`✖ Error during init: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("open [path]")
  .description("Open an Ontology project: launches an interactive picker over previously created projects, or opens [path] directly when given.")
  .action(async (pathArg) => {
    try {
      await openCommand({ path: pathArg });
    } catch (err: unknown) {
      console.error(`✖ Error during open: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const projects = program
  .command("projects")
  .description("Manage the global Ontology project registry (~/.config/ontology/projects.json).");

projects
  .command("list")
  .description("List every project the global registry knows about, separating live and stale entries.")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await projectsListCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error listing projects: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

projects
  .command("forget <pathOrName>")
  .description("Drop a project from the registry. Does not delete the project itself.")
  .option("--json", "Output results in JSON format")
  .action(async (pathOrName, options) => {
    try {
      await projectsForgetCommand(pathOrName, options);
    } catch (err: unknown) {
      console.error(`✖ Error forgetting project: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description("Diagnose the Ontology environment and project.")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await doctorCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during doctor: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("validate")
  .description("Validates the integrity and schema of the network.")
  .action(async () => {
    try {
      await validateCommand();
    } catch (err: unknown) {
      console.error(`✖ Error during validation: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("replay")
  .description("Rebuild the state summary from events.jsonl alone and compare it to state.json (the replay law: every log-derived field must match). Verifies chain integrity (sequence + previousEventId) while folding. Read-only by default; exits 1 on divergence.")
  .option("--write", "Repair state.json from the replayed fold (refused if the chain itself is broken).")
  .option("--json", "Output the replay report as JSON.")
  .action(async (options) => {
    try {
      await replayCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during replay: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("drift")
  .description("Merkle change-detection over the compiled shadows: hashes every file referenced by node.outputs.files, compares the tree against the last anchor, and reports exactly which nodes' artifacts moved (feed them to verify-homeomorphism --nodes). Read-only by default.")
  .option("--update", "Persist the current tree as the new anchor (.ontology/drift/snapshot.json) and append a drift_anchored event.")
  .option("--fail-on-drift", "Exit 1 when anything drifted relative to the anchor (CI guard).")
  .option("--json", "Output the drift report as JSON.")
  .action(async (options) => {
    try {
      await driftCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during drift: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const semantic = program
  .command("semantic")
  .description("Local semantic index over the INTENT graph (embeddings as hypothesis generation, never as truth). Index is derived cache under .ontology/embeddings/; suggestions become proposals through the standard gate.");

semantic
  .command("index")
  .description("Build/refresh the embedding index over every node's intent text (label + prompt + rules + provided-token descriptions). Incremental: nodes whose text is unchanged reuse their cached vector. Providers: mock (deterministic, $0) or ollama (nomic-embed-text by default, local).")
  .option("--provider <provider>", "Embedding provider: mock | ollama (default mock)")
  .option("--model <model>", "Embedding model (default: nomic-embed-text for ollama, mock_embed for mock)")
  .option("--host <url>", "Ollama host (default OLLAMA_HOST or http://127.0.0.1:11434)")
  .option("--json", "Output the index report as JSON.")
  .action(async (options) => {
    try {
      await semanticIndexCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during semantic index: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

semantic
  .command("links")
  .description("Rank high-similarity node pairs that have NO edge between them — embedding-generated hypotheses for missing links. Read-only by default (prints copy-pasteable `onto propose link` commands); with --propose --type <t> each pair becomes an edge_create proposal pinned to both endpoints' hashes.")
  .option("--threshold <x>", "Minimum cosine similarity to report (default 0.7)")
  .option("--top <n>", "Maximum pairs to report (default 10)")
  .option("--propose", "Create an edge_create proposal per pair (requires --type).")
  .option("--type <edgeType>", "Edge type for proposed links — similarity is symmetric, the human picks the semantics.")
  .option("--json", "Output the suggestion report as JSON.")
  .action(async (options) => {
    try {
      await semanticLinksCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during semantic links: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("inspect")
  .description("Observes the current topological state of the network without mutating it.")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await inspectCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during inspection: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const node = program
  .command("node")
  .description("Manage Ontology nodes.");

node
  .command("create")
  .description("Creates a new node in the intention network.")
  .requiredOption("--level <level>", "Abstraction level for the node.")
  .requiredOption("--kind <kind>", "Semantic kind for the node.")
  .requiredOption("--prompt <prompt>", "Raw intention prompt for the node.")
  .option("--label <label>", "Optional label for the node.")
  .option("--manifestation <m>", "Manifestation: intent / ast / osl / code / test / build (default intent).")
  .option("--language <lang>", "Optional language tag (e.g., python, typescript) used by the compiler to pick the artifact extension.")
  .option("--requires <tokens>", "Comma-separated tokens this node requires from its context (lands in context.requires).")
  .option("--provides <tokens>", "Comma-separated tokens this node provides to its context (lands in context.provides).")
  .option("--forbids <tokens>", "Comma-separated tokens this node forbids appearing in its outputs (lands in context.forbids).")
  .option("--rules <rules>", "Pipe-separated rule strings, e.g. 'FORBID: console.log|REQUIRE: emits event' (lands in node.rules).")
  .option("--literal <text>", "Pin the compiled artifact body verbatim to <text>. Compile bypasses model dispatch and emits <text> directly; validator and runtime check still apply. Use for irreducible-specificity content (regexes, magic constants, license headers).")
  .option("--literal-file <path>", "Same as --literal, but read the pinned body from a file. Mutually exclusive with --literal.")
  .action(async (options) => {
    await createNodeCommand(options);
  });

node
  .command("list")
  .description("Lists all nodes in the intention network.")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await nodeListCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error listing nodes: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

node
  .command("show <id>")
  .description("Shows details of a specific node.")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await nodeShowCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error showing node: ${errorMessage(err)}`);
      process.exit(1);
    }
  });


node
  .command("link")
  .description("Create a typed semantic edge between two nodes.")
  .requiredOption("--from <nodeId>", "Source node ID")
  .requiredOption("--to <nodeId>", "Target node ID")
  .requiredOption("--type <edgeType>", "Type of the semantic edge")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await nodeLinkCommand(options);
    } catch (err: unknown) {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
      } else {
        console.error(`✖ Error linking nodes: ${errorMessage(err)}`);
      }
      process.exit(1);
    }
  });

node
  .command("update <id>")
  .description("Edit a node in place: prompt / label / rules / contract tokens. Re-hashes and emits a node_updated event with old and new hashes. Fields not passed are preserved verbatim; passing an empty string clears that field.")
  .option("--prompt <prompt>", "New prompt text (replaces node.prompt.raw and the source_prompt input).")
  .option("--label <label>", "New label.")
  .option("--rules <rules>", "Pipe-separated rule strings; replaces node.rules wholesale. Pass --rules \"\" to clear.")
  .option("--requires <tokens>", "Comma-separated tokens; replaces context.requires wholesale. Pass --requires \"\" to clear.")
  .option("--provides <tokens>", "Comma-separated tokens; replaces context.provides wholesale. Pass --provides \"\" to clear.")
  .option("--forbids <tokens>", "Comma-separated tokens; replaces context.forbids wholesale. Pass --forbids \"\" to clear.")
  .option("--literal <text>", "Set the literal escape hatch: compile emits <text> verbatim instead of dispatching the model. Replaces any existing literal.")
  .option("--literal-file <path>", "Same as --literal, but read the pinned body from a file. Mutually exclusive with --literal.")
  .option("--clear-literal", "Remove the literal escape hatch so the node returns to model-driven compile.")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await nodeUpdateCommand(id, options);
    } catch (err: unknown) {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
      } else {
        console.error(`✖ Error updating node: ${errorMessage(err)}`);
      }
      process.exit(1);
    }
  });

node
  .command("inspect <id>")
  .description("Project Legend δ-1 (Inspector / Lupa): render a human-readable 3-5 sentence summary of what this node does and what invariants any implementation must preserve. Cached on the node as `translator` — one LLM call per node lifetime. Subsequent inspects return the cached text; the cache auto-invalidates when prompt / rules / contract change (sourceHash mismatch). Pass --regenerate to force a fresh dispatch.")
  .option("--provider <provider>", "LLM provider override (mock, ollama, or anthropic). When omitted, routes per-node via the model registry.")
  .option("--model <model>", "Model override (only meaningful with --provider).")
  .option("--ollama-host <host>", "Host for Ollama provider.")
  .option("--regenerate", "Force a fresh inspect even when the cached translator is valid. Useful for iterating on the inspector prompt or switching providers.")
  .option("--json", "Output results in JSON format.")
  .action(async (id, options) => {
    try {
      await nodeInspectCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error during node inspect: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

node
  .command("remove <id>")
  .description("Delete a node's record and emit a node_removed event. Refuses if any edge references the node — remove the edges first with onto edge remove.")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await nodeRemoveCommand(id, options);
    } catch (err: unknown) {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
      } else {
        console.error(`✖ Error removing node: ${errorMessage(err)}`);
      }
      process.exit(1);
    }
  });

const edge = program
  .command("edge")
  .description("Edit semantic edges: drop them or re-classify their type. Edge creation lives under `onto node link` (kept for legacy).");

edge
  .command("remove <edgeId>")
  .description("Drop an edge by id. Emits an edge_removed event; rewrites edges.jsonl atomically.")
  .option("--json", "Output results in JSON format")
  .action(async (edgeId, options) => {
    try {
      await edgeRemoveCommand(edgeId, options);
    } catch (err: unknown) {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
      } else {
        console.error(`✖ Error removing edge: ${errorMessage(err)}`);
      }
      process.exit(1);
    }
  });

edge
  .command("update <edgeId>")
  .description("Re-classify an edge's type in place. Re-hashes and emits an edge_updated event with old and new types/hashes.")
  .requiredOption("--type <newType>", "New edge type (one of the allowed EdgeType enum values).")
  .option("--json", "Output results in JSON format")
  .action(async (edgeId, options) => {
    try {
      await edgeUpdateCommand(edgeId, options);
    } catch (err: unknown) {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
      } else {
        console.error(`✖ Error updating edge: ${errorMessage(err)}`);
      }
      process.exit(1);
    }
  });
const modelCmd = program
  .command("model")
  .description("Manage Ontology LLM models.");

modelCmd
  .command("doctor")
  .description("Diagnose the model runtime.")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await modelDoctorCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during model doctor: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

modelCmd
  .command("list")
  .description("Lists all available models.")
  .option("--provider <provider>", "Filter models by provider")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await modelListCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error listing models: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const events = program
  .command("events")
  .description("Manage Ontology events.");

events
  .command("tail")
  .description("Tail the events log.")
  .option("--json", "Output results in JSON format")
  .option("--limit <number>", "Number of events to tail")
  .action(async (options) => {
    try {
      await eventsTailCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error tailing events: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const contextCmd = program
  .command("context")
  .description("Manage Ontology context assembly.");

contextCmd
  .command("assemble <id>")
  .description("Assemble the context for a given node.")
  .option("--json", "Output results in JSON format")
  .option("--branch <branch>", "Branch to assemble context for")
  .option("--time <time>", "Time to assemble context for")
  .option("--mode <mode>", "Mode for context assembly (only 'strict' is supported)")
  .option("--include-edges", "Include edge-aware context")
  .option("--edge-types <types>", "Comma-separated list of edge types to include")
  .action(async (id, options) => {
    try {
      await contextAssembleCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error assembling context: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const run = program
  .command("run")
  .description("Run actions like prompts.");

run
  .command("context <id>")
  .description("Run an LLM task against an assembled context.")
  .option("--provider <provider>", "LLM provider to use")
  .option("--task <task>", "Task to run")
  .option("--branch <branch>", "Branch to use for context")
  .option("--time <time>", "Time to use for context")
  .option("--mode <mode>", "Mode for context assembly")
  .option("--validate", "Run deterministic intent validation")
  .option("--identify-equal-providers", "With --validate: treat two providers of the same key as compatible (glued) when they carry an identical syntactic signature, instead of a duplicate-provider conflict (O2 sheaf policy). Opt-in; default enforces provider-uniqueness.")
  .option("--model <model>", "Model to use for the selected LLM provider")
  .option("--ollama-host <host>", "Host for Ollama provider")
  .option("--include-edges", "Include edge-aware context in the assembled prompt")
  .option("--edge-types <types>", "Comma-separated edge types to include (requires --include-edges)")
  .option("--persist", "Persist this run as a content-addressed record under .ontology/runs/")
  .option("--as-proposal", "Wrap the model's response into a typed candidate proposal (auto-implies --persist)")
  .option("--proposal-level <level>", "Required with --as-proposal: abstraction level for the proposed node")
  .option("--proposal-kind <kind>", "Required with --as-proposal: semantic kind for the proposed node")
  .option("--proposal-parent <nodeId>", "Optional with --as-proposal: parent node id (defaults to the focal node)")
  .option("--proposal-label <label>", "Optional with --as-proposal: human label for the proposed node")
  .option("--proposal-rationale <text>", "Optional with --as-proposal: rationale recorded in the proposal's provenance")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await runContextCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error running context: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

run
  .command("prompt")
  .description("Run an LLM task directly.")
  .option("--task <task>", "Task to run")
  .option("--prompt <prompt>", "Prompt to send")
  .option("--provider <provider>", "LLM provider to use")
  .option("--model <model>", "Model to use for the selected LLM provider")
  .option("--ollama-host <host>", "Host for Ollama provider")
  .option("--persist", "Persist this run as a content-addressed record under .ontology/runs/")
  .option("--as-proposal", "Wrap the model's response into a typed candidate proposal (auto-implies --persist)")
  .option("--proposal-level <level>", "Required with --as-proposal: abstraction level for the proposed node")
  .option("--proposal-kind <kind>", "Required with --as-proposal: semantic kind for the proposed node")
  .option("--proposal-parent <nodeId>", "Optional with --as-proposal: parent node id (defaults to root canon)")
  .option("--proposal-label <label>", "Optional with --as-proposal: human label for the proposed node")
  .option("--proposal-rationale <text>", "Optional with --as-proposal: rationale recorded in the proposal's provenance")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    if (!options.task) {
      console.error("✖ Missing required option: --task");
      process.exit(1);
    }
    if (!options.prompt) {
      console.error("✖ Missing required option: --prompt");
      process.exit(1);
    }

    try {
      await runPromptCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error running prompt: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const runs = program
  .command("runs")
  .description("Inspect persisted run records (.ontology/runs/).");

runs
  .command("list")
  .description("List persisted runs.")
  .option("--kind <kind>", "Filter by kind: prompt or context")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await runsListCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error listing runs: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

runs
  .command("show <id>")
  .description("Show a persisted run record.")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await runsShowCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error showing run: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

runs
  .command("verify <id>")
  .description("Recompute the deterministic id and body hash of a persisted run and report any divergence.")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await runsVerifyCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error verifying run: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("walk <id>")
  .description("Open the Walker, an interactive focal-cell terminal view of a node. Read-only in v0.")
  .action(async (id) => {
    try {
      await walkCommand(id);
    } catch (err: unknown) {
      console.error(`✖ Error opening walker: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const graph = program
  .command("graph")
  .description("Read-only traversal queries over the typed graph (neighbors, path, subgraph, metrics, hierarchize, readiness, materialize-edges).");

graph
  .command("materialize-edges <src-ontology-dir> <dst-ontology-dir>")
  .description("Phase ε empirical-validation harness: clone an ontology directory and apply the statically-inferred edges into the copy. Read-only on the source; the destination is a self-consistent ontology with the new edges + edge_created events appended. No LLM, no proposal writes. Use this to set up the gamma-with-edges copy before running `verify-homeomorphism` to test whether the simulated brújula movement predicts regeneration quality.")
  .requiredOption("--source-root <code-dir>", "Directory to scan for static imports (the same path `onto ingest <dir>` would have used).")
  .option("--include <exts>", "Comma-separated file extensions to scan (default: ts,tsx).")
  .option("--json", "Output the report in JSON format")
  .action(async (srcDir, dstDir, options) => {
    try {
      await graphMaterializeEdgesCommand(srcDir, dstDir, options.sourceRoot, options);
    } catch (err: unknown) {
      console.error(`✖ Error materializing edges: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

graph
  .command("readiness")
  .description("Structural-readiness gate: evaluates three rules over the typed graph (nodes-without-edges, global-satisfied-unreachable, topologically-flat) and exits non-zero when any rule fails. Read-only. Use after an ingest sweep — or in CI — to prevent declaring a self-ingest complete when the brújula says otherwise.")
  .option("--ontology-dir <path>", "Evaluate readiness against an arbitrary ontology directory instead of the active project.")
  .option("--json", "Output the report in JSON format")
  .action(async (options) => {
    try {
      await graphReadinessCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error evaluating readiness: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

graph
  .command("hierarchize")
  .description("Read-only preview of a deterministic hierarchization plan: promote outputs.files[0] directory structure into first-class intermediate nodes. Pure, no LLM, no mutation. Reparenting via proposals is not yet possible (see plan.proposalCapability.blockedBy); the command always runs in preview mode.")
  .option("--ontology-dir <path>", "Plan against an arbitrary ontology directory instead of the active project.")
  .option("--json", "Output the plan in JSON format")
  .action(async (options) => {
    try {
      await graphHierarchizeCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error planning hierarchization: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

graph
  .command("metrics")
  .description("Read-only baseline metrics over the typed graph: topology, parent distribution, edges, requires/provides satisfaction (global + context-reachable), path fibers, and a flatness verdict. Pure: no LLM, no mutation.")
  .option("--ontology-dir <path>", "Score an arbitrary ontology directory (one containing nodes/, edges.jsonl, state.json) instead of the active project. Used to baseline archived snapshots like .ontology.self-ingest-gamma-result.")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await graphMetricsCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error computing metrics: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

graph
  .command("neighbors <id>")
  .description("List direct neighbors of a node along incident edges.")
  .option("--type <types>", "Comma-separated edge types to include")
  .option("--direction <direction>", "Direction relative to the focal node: in, out, or both", "both")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await graphNeighborsCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error listing neighbors: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

graph
  .command("path <from> <to>")
  .description("Find the shortest directed path between two nodes (BFS over outgoing edges).")
  .option("--type <types>", "Comma-separated edge types to traverse")
  .option("--max-depth <n>", "Maximum path length to consider", "10")
  .option("--json", "Output results in JSON format")
  .action(async (from, to, options) => {
    try {
      await graphPathCommand(from, to, options);
    } catch (err: unknown) {
      console.error(`✖ Error finding path: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

graph
  .command("subgraph <id>")
  .description("Extract the undirected k-hop neighborhood rooted at a node.")
  .option("--depth <n>", "Hops to expand from the focal node", "2")
  .option("--type <types>", "Comma-separated edge types to include")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await graphSubgraphCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error extracting subgraph: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

graph
  .command("infer-edges <dir>")
  .description("Project Legend γ-4 (preview) / γ-6 (proposals): walk a source directory and report the import-derived edges (depends_on for value imports, uses_token for type imports). Pure static analysis — no LLM. TypeScript uses the TS compiler API; Python uses a regex-based import parser. With --create-proposals, also emit one edge_create proposal per resolved edge by matching outputs.files[0] on each endpoint — the post-apply step of the multi-file ingest cycle.")
  .option("--create-proposals", "γ-6: resolve each inferred edge to applied node IDs via outputs.files[0] and emit edge_create proposals. Skips edges whose endpoints are not yet on the graph and edges that already exist.")
  .option("--metrics-preview", "Phase ε hierarchizer-followup: resolve the inferred edges the same way --create-proposals does but, instead of writing proposals, simulate the resulting edge fabric and report before/after metrics (especially closedWorldContextReachableSatisfaction — the brújula). Pure: no mutation.")
  .option("--ontology-dir <path>", "Score --metrics-preview against an arbitrary ontology directory instead of the active project. Mutually exclusive with --create-proposals.")
  .option("--include <exts>", "Comma-separated file extensions to scan (default: ts,tsx). Use --include py for a Python project, --include py,ts,tsx for a mixed-language repo.")
  .option("--json", "Output results in JSON format")
  .action(async (dir, options) => {
    try {
      await graphInferEdgesCommand(dir, options);
    } catch (err: unknown) {
      console.error(`✖ Error inferring edges: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const branch = program
  .command("branch")
  .description("Read-only views over Grothendieck fibers of the typed graph (list, fiber).");

branch
  .command("list")
  .description("List the distinct branches present in the project, with per-branch node counts.")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await branchListCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error listing branches: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

branch
  .command("fiber <name>")
  .description("Render the fiber over a branch: the induced subgraph of nodes and edges on that branch.")
  .option("--json", "Output results in JSON format")
  .action(async (name, options) => {
    try {
      await branchFiberCommand(name, options);
    } catch (err: unknown) {
      console.error(`✖ Error rendering branch fiber: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("link <id>")
  .description(
    "Run the semantic linker against a candidate response: gluing matrix + intent validation + edge proposal suggestions. Read-only.",
  )
  .option("--candidate <text>", "Candidate response text to validate against the focal's context")
  .option("--candidate-file <path>", "Read the candidate from a file (alternative to --candidate)")
  .option("--branch <branch>", "Override the active branch when assembling the focal's context")
  .option("--include-edges", "Project typed edges incident to the focal/ancestors into the gluing pool")
  .option("--edge-types <types>", "Comma-separated edge types to include (requires --include-edges)")
  .option("--no-suggest-edges", "Disable the edge proposal suggester")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await linkCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error during link: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const propose = program
  .command("propose")
  .description("Create typed candidate mutations (proposals) without touching the graph.");

propose
  .command("node")
  .description("Propose a node creation. Writes a proposal record but does not mutate the graph.")
  .requiredOption("--level <level>", "Abstraction level for the proposed node")
  .requiredOption("--kind <kind>", "Semantic kind for the proposed node")
  .requiredOption("--prompt <prompt>", "Raw intention prompt for the proposed node")
  .option("--label <label>", "Optional human label")
  .option("--parent <nodeId>", "Parent node id (defaults to the project root canon)")
  .option("--rationale <text>", "Optional human-authored explanation of why")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await proposeNodeCommand(options);
    } catch (err: unknown) {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
      } else {
        console.error(`✖ Error creating proposal: ${errorMessage(err)}`);
      }
      process.exit(1);
    }
  });

propose
  .command("link")
  .description("Propose a typed semantic edge between two nodes. Writes a proposal record but does not mutate the graph.")
  .requiredOption("--from <nodeId>", "Source node id")
  .requiredOption("--to <nodeId>", "Target node id")
  .requiredOption("--type <edgeType>", "Edge type (validated against EdgeTypeSchema)")
  .option("--branch <branch>", "Optional branch (defaults to the active branch at apply time)")
  .option("--rationale <text>", "Optional human-authored explanation of why")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await proposeLinkCommand(options);
    } catch (err: unknown) {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
      } else {
        console.error(`✖ Error creating proposal: ${errorMessage(err)}`);
      }
      process.exit(1);
    }
  });

const proposal = program
  .command("proposal")
  .description("Inspect and manage existing proposals.");

proposal
  .command("list")
  .description("List proposals.")
  .option("--status <status>", "Filter by status: pending, applied, rejected, staled")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await proposalListCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error listing proposals: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

proposal
  .command("show <id>")
  .description("Show a proposal record.")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await proposalShowCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error showing proposal: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

proposal
  .command("reject <id>")
  .description("Reject a pending proposal. Updates status, recomputes hash, appends a proposal_rejected event.")
  .option("--reason <text>", "Optional explanation recorded in the event payload")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await proposalRejectCommand(id, options);
    } catch (err: unknown) {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
      } else {
        console.error(`✖ Error rejecting proposal: ${errorMessage(err)}`);
      }
      process.exit(1);
    }
  });

proposal
  .command("apply <id>")
  .description("Translate a pending proposal into a real graph mutation, after re-validating its parentHash. Stale proposals (parent changed since creation) are transitioned to staled and refused.")
  .option("--dry-run", "Validate the proposal without writing anything")
  .option("--check-providers", "For a node_create/node_update proposal that declares `provides`: run the O2 identify-if-equal sheaf check against existing providers of the same keys (same branch). Compatible re-provisions (equal signature) are reported as identifications; drift (different/missing signature) as a warning. Opt-in, read-only; warns only unless --strict. See docs/design/laws/CONTEXT_GLUING_REGIMES.md.")
  .option("--strict", "With the provider check (implied if --check-providers is omitted): BLOCK the apply on provider drift instead of warning. The proposal stays pending — resolve the drift or re-run without --strict. A check that errors also blocks (cannot verify ⇒ do not apply).")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await proposalApplyCommand(id, options);
    } catch (err: unknown) {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
      } else {
        console.error(`✖ Error applying proposal: ${errorMessage(err)}`);
      }
      process.exit(1);
    }
  });

const compile = program
  .command("compile")
  .description("Compile a node and its dependency closure into artifacts. Use `compile plan` for a read-only preview of the order.");

compile
  .command("plan <id>")
  .description("Print the topological compile plan rooted at a node, in dependency order. Read-only preview, no artifact written.")
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await compilePlanCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error computing compile plan: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

compile
  .command("run <id>")
  .description("Compile the focal node and its dependency closure, writing artifacts to .ontology/artifacts/generated/. The structure-preserving functor of the canon, made concrete.")
  .option("--provider <provider>", "LLM provider override (mock or ollama). When omitted, each node compiles via its own model.ref resolved through the registry.")
  .option("--model <model>", "Model override (only meaningful with --provider; ignored on the per-node ref path)")
  .option("--ollama-host <host>", "Host for Ollama provider")
  .option("--runtime-check", "After parse-check, execute the artifact (with timeout) and fail with runtime_failed on non-zero exit")
  .option("--runtime-check-timeout-ms <ms>", "Wall-clock timeout for the runtime check (default 5000, max 60000)", (v) => parseInt(v, 10))
  .option("--branch <name>", "Restrict the compile to the Grothendieck fiber over <name>: only intra-branch edges participate in the plan, and the focal must itself live on that branch.")
  .option("--target <path>", "Write the focal's compiled artifact to <path> instead of .ontology/artifacts/generated/<nodeId>.<ext>. Relative paths resolve against cwd; missing parents are created. Upstream steps still land under generated/.")
  .option("--force", "Required to overwrite an existing file at --target. Without it, an existing target makes the focal step fail with reason=target_exists before any bytes are written.")
  .option("--open-world", "Open-world validation: unsatisfied 'requires' tokens degrade to warnings instead of hard failures. Use when the focal's contract references external dependencies (stdlib, pip, npm) that no other node provides — common for ingest-derived graphs (Project Legend γ-5).")
  .option("--max-tokens <n>", "Override the LLM's max-output-tokens setting (anthropic default: 8192). Use for large artifacts that may need 16K+; the Vibe-Reasoning calibration found 4096 insufficient on files >~3KB once adaptive thinking eats budget.", (v) => parseInt(v, 10))
  .option("--no-thinking", "Suppress adaptive thinking on providers that support it (anthropic Opus 4.7). Useful for large prompts where adaptive thinking exhausts the output budget and the response comes back as empty text.")
  .option("--no-lock", "Skip the .ontology/.lock advisory lock. Off by default — the lock serializes concurrent cooperators. Pass when you know the prior process is gone (e.g. cross-host stale file the auto-detector cannot break safely).")
  .option("--json", "Output results in JSON format")
  .action(async (id, rawOptions) => {
    try {
      const { thinking: rawThinking, lock: rawLock, ...rest } = rawOptions as Record<string, unknown> & { thinking?: boolean; lock?: boolean };
      const options = {
        ...rest,
        ...(rawThinking === false ? { thinking: "disabled" as const } : {}),
        ...(rawLock === false ? { noLock: true } : {}),
      };
      await compileRunCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error during compile: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

compile
  .command("run-batch")
  .description("Compile multiple focals in one invocation, sharing the per-run cache across plans. Pre-foundation for Project Legend's multi-file verify-homeomorphism.")
  .option("--all-artifacts", "Compile every node whose coordinates.manifestation is \"code\". Mutually exclusive with --nodes.")
  .option("--nodes <ids>", "Comma-separated list of focal node ids to compile. Mutually exclusive with --all-artifacts.")
  .option("--provider <provider>", "LLM provider override (mock or ollama). When omitted, each node compiles via its own model.ref resolved through the registry.")
  .option("--model <model>", "Model override (only meaningful with --provider).")
  .option("--ollama-host <host>", "Host for Ollama provider.")
  .option("--runtime-check", "After parse-check, execute each artifact and fail its focal with runtime_failed on non-zero exit.")
  .option("--runtime-check-timeout-ms <ms>", "Wall-clock timeout for the runtime check (default 5000, max 60000).", (v) => parseInt(v, 10))
  .option("--branch <name>", "Restrict the batch to focals living on the named branch; the plan walk is fibre-scoped for each focal as well.")
  .option("--open-world", "Open-world validation (same semantics as compile run --open-world). Applied uniformly to every step in every focal's plan.")
  .option("--max-tokens <n>", "Override the LLM's max-output-tokens setting for every dispatch in the batch (anthropic default: 8192).", (v) => parseInt(v, 10))
  .option("--no-thinking", "Suppress adaptive thinking on providers that support it (anthropic Opus 4.7). Applied uniformly across the batch.")
  .option("--no-lock", "Skip the .ontology/.lock advisory lock — see compile run for semantics.")
  .option("--json", "Output results in JSON format")
  .action(async (rawOptions) => {
    try {
      const { thinking: rawThinking, lock: rawLock, ...rest } = rawOptions as Record<string, unknown> & { thinking?: boolean; lock?: boolean };
      const options = {
        ...rest,
        ...(rawThinking === false ? { thinking: "disabled" as const } : {}),
        ...(rawLock === false ? { noLock: true } : {}),
      };
      await compileRunBatchCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during compile run-batch: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("ingest [paths...]")
  .description("Project Legend γ-1 + γ-5 + Phase ε prework A + #2 connectors: extract structured intent from source code OR from a GitHub PR/issue. Positional paths (file or directory) run the code extractor; --from-pr/--from-issue run the prose extractor (manifestation=intent) over the PR/issue via the `gh` CLI. A single file produces one node_create proposal; a directory walks every matching file. Multiple paths are unioned and deduped by realpath. Provide exactly one of {paths, --from-pr, --from-issue}. Defaults to provider=anthropic (requires ANTHROPIC_API_KEY); use --provider ollama or --provider mock for $0 runs. --dry-run previews without committing.")
  .option("--provider <provider>", "LLM provider override: anthropic (default), ollama, or mock.")
  .option("--model <model>", "Model override. For anthropic, defaults to claude-opus-4-7.")
  .option("--ollama-host <host>", "Host for Ollama provider.")
  .option("--parent <nodeId>", "Parent node id for the proposed node. Defaults to the project root canon.")
  .option("--dry-run", "Dispatch + parse + print the extraction, but do NOT create a proposal. Use to iterate the extraction template without piling up rejected proposals.")
  .option("--cost-estimate", "Pre-flight cost guard: walk the inputs, count file sizes, multiply by published rates for the resolved provider, print the breakdown (per-input when multiple paths), and exit WITHOUT dispatching the LLM. Run this before any anthropic ingest on a large tree to confirm the cost. Unlike --dry-run, --cost-estimate makes ZERO API calls.")
  .option("--include <exts>", "Directory mode only: comma-separated file extensions to ingest (default: ts,tsx). Use --include py for a Python project, --include py,ts,tsx for a mixed repo. Has no effect on a single explicit file path. Static-edge inference (γ-4) stays TS-only — non-TS ingests skip the cross-file edge report.")
  .option("--ensemble <mode>", "Phase ε E6 step 4: structured-extraction ensemble strategy. \"none\" (default) — single-run via the resolved model. \"high-confidence\" — run llama3.2:3b three times and select the most complete valid extraction. Use when 100% coverage on the perimeter matters more than per-file wall-clock. Currently honoured for semantic_parse (ingest extraction) only; other LlmTasks ignore the flag. Calibration: BAKEOFF_3B_FAMILY_2026-05-15.md §2.2.")
  .option("--static-classifier <mode>", "Structural Semantic Classifier integration. Two modes: \"report-only\" — classify every file with the deterministic AST-based classifier (src/inverse/structural-classifier.ts) and surface aggregates in the INGEST report; does NOT change LLM routing. \"enabled\" — additionally consume those facts as ingest policy: files classified as `barrel` or `declaration_only` bypass the LLM entirely and receive a deterministic static summary (src/inverse/static-summary.ts); every other shape — including `schema_module` — still dispatches via semantic_parse. Conservative on purpose: the v0 deflection set is intentionally small (smoke-test data showed ~5% of a typical perimeter deflects). The INGEST report's \"Classifier routing\" section surfaces the actual savings.")
  .option("--json", "Output results in JSON format.")
  .option("--resolved-signatures", "Directory / multi-input mode only: attach RESOLVED-type signatures to ingested `provides` (a whole-program TypeChecker pass — alias expansion, inferred types) instead of the syntactic tier. Tier-tagged so resolved signatures never glue with syntactic ones. Heavier (builds one ts.Program over the swept TS/JS files); opt-in. Refines which providers match under the O2 signature sheaf. See docs/design/laws/CONTEXT_GLUING_REGIMES.md.")
  .option("--from-pr <number>", "#2: ingest intent from a GitHub pull request (via `gh`) instead of source paths. Runs the prose extractor → one node_create proposal with manifestation=intent. Mutually exclusive with positional paths and --from-issue.")
  .option("--from-issue <number>", "#2: ingest intent from a GitHub issue (via `gh`) instead of source paths. Runs the prose extractor → one node_create proposal with manifestation=intent. Mutually exclusive with positional paths and --from-pr.")
  .option("--repo <owner/repo>", "Optional repository override for --from-pr/--from-issue (defaults to the gh-resolved repo of the current directory).")
  .option("--resolve-edges <nodeId>", "Post-apply edge mode (requires --from-pr): given the APPLIED node id of a previously ingested PR intent, re-fetch the PR's changed files and create `documents` edge_create proposals from that node to each matching existing code node. Edges can't be created at capture time because the PR node id is only assigned on apply (mirrors the γ-5 → γ-6 two-phase shape).")
  .option("--intent", "Intent-narration mode (the WHY-as-prompt lift). Reads the positional file paths as ONE neighbourhood and narrates the code's PURPOSE as a generative prompt + a behaviour oracle (acceptance criteria) — deliberately lossy, distinct from the default contract extractor. Produces one manifestation=intent node_create proposal (unless --dry-run). Pass several files to narrate their composed subsystem intent. See docs/design/inverse/INTENT_NARRATION_SPEC.md.")
  .action(async (paths: string[], options) => {
    try {
      await ingestCommand(paths ?? [], options);
    } catch (err: unknown) {
      console.error(`✖ Error during ingest: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("frontier <paths...>")
  .description("Phase ε pre-flight diagnostic: runs the frontier tagger (src/inverse/frontier-tagger.ts) over every TS/TSX file in the given paths and reports the multi-label tag distribution. Pure $0, no LLM, no project state mutation. Use to confirm the tagger assigns sensible attributes to a perimeter before paying for ingest — catches rule gaps that would otherwise surface only after a paid run. Same multi-positional contract as `onto ingest`.")
  .option("--include <exts>", "Comma-separated file extensions to walk (default: ts,tsx).")
  .option("--totals-only", "Suppress the per-file listing; print only aggregate totals (distribution + diagnostic counts).")
  .option("--json", "Output results in JSON format.")
  .action(async (paths: string[], options) => {
    try {
      await frontierCommand(paths, options);
    } catch (err: unknown) {
      console.error(`✖ Error during frontier preview: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

registerQueryCommand(program);

program
  .command("mcp")
  .description("Start a read-only MCP server over the intent graph (stdio transport). Exposes query / graph-traversal / runs / audit-log tools and canon + overview resources so a third party (a human reviewer, or another model) can READ the declared intent and the audit chain to judge whether it is benign and competent — without mutating the graph and without needing the implementation source. No mutation tools are exposed (canon rule: models may speak; only explicit graph commands may mutate).")
  .option("--cwd <path>", "Path to the Ontology project to serve (default: current directory).")
  .action(async (options) => {
    try {
      await ontoMcpCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error starting MCP server: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("bakeoff <reports...>")
  .description("#4 fidelity release-gate: fold N verify-homeomorphism --json reports (recorded arm outputs) into one cross-arm synthesis via synthesizeBakeoff, and apply an H1 floor gate. Each positional is a report path or `label=path` (e.g. A=arm-a.json); the first arm is the baseline. HONESTY: this consumes ALREADY-RECORDED reports — it does NOT re-run the LLM (a live verify needs a real model, infeasible in CI). The gate is regression protection over the scoring + recorded corpus, not a fresh measurement. Exits non-zero if any arm's mean structural Jaccard is below --min-jaccard.")
  .option("--min-jaccard <n>", "H1 gate floor: mean structural Jaccard must be >= this (default 0.1, the pre-registered ε floor).", parseFloat)
  .option("--gate-all", "Require EVERY arm to clear the floor (default: gate the baseline arm only — comparison arms can legitimately score low).")
  .option("--baseline <label>", "Arm label to treat as the synthesis baseline and gate target (default: the first positional).")
  .option("--report <path>", "Write the full cross-arm synthesis as a markdown document to this path.")
  .option("--json", "Emit { gate, synthesis } as JSON instead of the human table.")
  .action(async (reports: string[], options) => {
    await runBakeoffCommand(reports, options);
  });

program
  .command("verify-homeomorphism [focal]")
  .description("Project Legend δ-2: compile-back each selected node, diff vs the original source on disk, classify with two distances (LoC + structural Jaccard over top-level declaration names). The publishable measurement for §3.10 in MATHEMATICAL_CLAIMS.md — F ∘ G ≈ id_Code modulo ε. Selectors: positional <focal> for one node, --nodes id1,id2,... for an explicit list, --all-artifacts for every node with coordinates.manifestation=code.")
  .option("--all-artifacts", "Verify every node whose coordinates.manifestation is \"code\". Mutually exclusive with --nodes and a positional focal.")
  .option("--nodes <ids>", "Comma-separated list of focal node ids to verify. Mutually exclusive with --all-artifacts and a positional focal.")
  .option("--provider <provider>", "LLM provider override (mock, ollama, or anthropic). When omitted, each node compiles via its own model.ref.")
  .option("--model <model>", "Model override (only meaningful with --provider).")
  .option("--ollama-host <host>", "Host for Ollama provider.")
  .option("--max-tokens <n>", "Override the LLM's max-output-tokens setting per compile-back (anthropic default 8192).", (v) => parseInt(v, 10))
  .option("--no-thinking", "Suppress adaptive thinking on providers that support it (anthropic Opus 4.7). Useful for large prompts where adaptive thinking exhausts the output budget and the response comes back as empty text — γ-7 calibration finding on visualize_adaptive_strategy.py.")
  .option("--open-world", "Open-world validation: unsatisfied 'requires' tokens degrade to warnings (default: true for verify, since ingest-derived contracts routinely reference external deps). Pass --no-open-world to enforce strict closed-world.")
  .option("--no-open-world", "Disable the default open-world relaxation; use strict closed-world validation instead.")
  .option("--loc-threshold <n>", "LoC distance below this counts as \"small\" for the verdict folder (default 0.3, range 0-1).", (v) => parseFloat(v))
  .option("--jaccard-threshold <n>", "Structural Jaccard at or above this counts as \"similar\" (default 0.5, range 0-1).", (v) => parseFloat(v))
  .option("--cost-estimate", "Pre-flight cost guard: walks the inputs, estimates compile-back cost, exits WITHOUT dispatching the LLM.")
  .option("--dry-run", "Skip the compile-back dispatch entirely. Reads any existing regen under .ontology/verify/<nodeId>.<ext> and re-classifies with current thresholds. Useful for tuning thresholds without paying for new dispatches.")
  .option("--report <path>", "Also write a markdown report of the verdict + per-node usage to the given path (in addition to stdout / --json). Shape mirrors docs/legend/calibrations/* reports.")
  .option("--matrix", "Phase ε prework C: emit the six-axis matrix (contract, structural, behavior, intent, literalRequired, cost) per node + per-axis aggregate counts alongside the legacy verdict report. The pilot fills structural + cost + literalRequired with measured data; the other axes report explicit not-measured / untested / not-reviewed until their checkers ship.")
  .option("--ast-grounding", "Phase ε Move 3α: append a deterministic MANDATORY EXPORTS section (from the source AST) to the code_sketch system prompt for every compile-back dispatch, and fold the grounding identity into the run-cache contextHash. Off by default — opt in to test the AST-grounding lift independently of model swaps; pre-3α calibrations and Sonnet ceiling probes choose to include or exclude this independently.")
  .option("--reps <n>", "Phase ε design §4.2: run N compile-back dispatches per node and aggregate the per-rep metrics (default 1 — point estimate). N > 1 defangs single-draw Jaccard variance (γ observed 1.0 → 0.0 on the same node across two draws), at the cost of N× LLM spend. Use before any Opus 4.7 ceiling probe to make the verdict robust.", (v) => parseInt(v, 10))
  .option("--aggregator <mode>", "Aggregator over per-rep numeric metrics when --reps > 1: 'median' (default — variance-resistant for the H1 floor read) or 'mean'. Ignored when --reps is 1.")
  .option("--behavior-check", "Phase ε behaviour-axis checker (v0): for each node, import the source file and the regen, run the registered fixture's call-sites against both, and override the matrix's `behavior` axis with the measured pass/fail/untested state. Requires --matrix. See docs/design/inverse/BEHAVIOUR_AXIS_CHECKER_SPEC.md.")
  .option("--behavior-fixtures-dir <path>", "Override the fixtures directory (default tests/behavior-fixtures/). Path is relative to cwd or absolute. Used with --behavior-check.")
  .option("--behavior-timeout-ms <n>", "Per-case wall-clock cap for the behaviour checker. Clamped to [100, 60000]. Default 5000.", (v) => parseInt(v, 10))
  .option("--contract-check", "Contract-axis checker (v0): statically compare each node's declared context.provides (keys + O1 signatures) against the regen artifact's extracted exports and override the matrix's `contract` axis with the measured pass/fail/unknown state. $0 — no LLM, no execution. Requires --matrix. See docs/design/inverse/CONTRACT_AXIS_CHECKER_SPEC.md.")
  .option("--no-lock", "Skip the .ontology/.lock advisory lock — see compile run for semantics.")
  .option("--json", "Output results in JSON format.")
  .action(async (focal, rawOptions) => {
    try {
      // commander emits `thinking: false` when --no-thinking is passed
      // (its default is true). Translate to the typed adapter form.
      const { thinking: rawThinking, lock: rawLock, ...rest } = rawOptions as Record<string, unknown> & { thinking?: boolean; lock?: boolean };
      const options = {
        ...rest,
        ...(rawThinking === false ? { thinking: "disabled" as const } : {}),
        ...(rawLock === false ? { noLock: true } : {}),
      };
      await verifyHomeomorphismCommand(focal, options);
    } catch (err: unknown) {
      console.error(`✖ Error during verify-homeomorphism: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("regenerate <nodeId>")
  .description("Regenerate a node's code shadow from its intent (forward functor F), verify the candidate against the source on disk, and — only with --write, and only when the regeneration is structure-preserving — overwrite the real source file. Default is preview-only (stages + reports, touches no source). The governed lever for the kernel-of-equivalence map (ROUNDTRIP_BILATERAL_2026-06-12).")
  .option("--write", "Overwrite the shadow source file. Gated: refuses unless the verdict is structure-preserving (epsilon_equivalent / divergent_loc) and any behaviour fixture passes.")
  .option("--provider <provider>", "REQUIRED. LLM provider for the compile-back (mock|ollama|anthropic|gemini). No default: omitting it used to silently route to the mock identity functor and fake a pristine measurement. Pass --provider mock to force an identity/self-test run deliberately.")
  .option("--model <model>", "Model override (use with --provider).")
  .option("--ollama-host <host>", "Host for the Ollama provider.")
  .option("--behavior-check", "Run the node's behaviour fixture (if present) against source vs regen; a failing check blocks --write.")
  .option("--behavior-fixtures-dir <path>", "Override the behaviour-fixtures directory (default tests/behavior-fixtures).")
  .option("--draws <n>", "Multi-draw consensus: compile N independent drafts and only write the majority structural-agreement class (defangs single-draw variance). Default 1.", (v) => parseInt(v, 10))
  .option("--consensus <k>", "Consensus floor: write only when at least K of N draws agree (default strict majority, floor(N/2)+1).", (v) => parseInt(v, 10))
  .option("--refine <n>", "Verify-refine rounds (REGEN_INTENT_CONSUMPTION_2026-06-17 #2): when a round fails the gates, feed the failed behaviour criteria + export drift back into the next round's prompt. Needs --behavior-check for the behaviour signal. Default 1 (no refine); clamped to 4.", (v) => parseInt(v, 10))
  .option("--decompose", "Decomposition (REGEN_INTENT_CONSUMPTION_2026-06-17 #4): regenerate the module in slices (scaffold types+helpers → one slice per exported function, each seeing prior slices as fixed context), then assemble and gate the whole. Attacks the 'whole-contract-at-once' capacity limit. Implies a single assembled candidate.")
  .option("--keep-slices", "Monotone decompose (composes with --decompose --refine N): slices no failure implicates are FROZEN between rounds (reused verbatim, no dispatch); only implicated slices re-generate — passing work is kept, so coverage grows across rounds. Attribution is deterministic and conservative: any unattributable failure regenerates everything.")
  .option("--loc-threshold <n>", "LoC distance threshold for the verdict (default 0.3).", (v) => parseFloat(v))
  .option("--jaccard-threshold <n>", "Structural Jaccard threshold for the verdict (default 0.5).", (v) => parseFloat(v))
  .option("--no-open-world", "Enforce strict requires-satisfaction during compile-back (default open-world).")
  .option("--max-tokens <n>", "Override max-output-tokens for the compile-back.", (v) => parseInt(v, 10))
  .option("--no-ast-grounding", "Disable the MANDATORY EXPORTS grounding section (on by default — the calibrated F).")
  .option("--rules-grounding", "Prepend a deterministic @ontology:rules block to the artifact so rule-level intent round-trips (closes the LENS_LAWS E2 gap). Off by default — it changes artifact content.")
  .option("--check-rules", "Block --write when a regeneration violates a statically-decidable declared rule (FORBID/REQUIRE symbol). See `onto rules check`.")
  .option("--no-lock", "Skip the .ontology/.lock advisory lock.")
  .option("--json", "Output the result as JSON.")
  .action(async (nodeId, rawOptions) => {
    try {
      const { openWorld, astGrounding, lock, ...rest } = rawOptions as Record<string, unknown> & {
        openWorld?: boolean;
        astGrounding?: boolean;
        lock?: boolean;
      };
      const options = {
        ...rest,
        ...(openWorld === false ? { openWorld: false } : {}),
        ...(astGrounding === false ? { astGrounding: false } : {}),
        ...(lock === false ? { noLock: true } : {}),
      };
      await regenerateCommand(nodeId, options);
    } catch (err: unknown) {
      console.error(`✖ Error during regenerate: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Read-only graph health for the sync loop: how many nodes are syncable-with-confidence (code shadow + behaviour fixture + rules statically clean), how many are lower-confidence (no fixture) or blocked (rule violation), how many shadows drifted from the anchor, and the ficha-quality summary. A pure composition of shadow/fixture presence + `onto drift` + `onto ficha audit` — writes nothing, runs no fixtures. See docs/design/runtime/SYNC_LOOP_SPEC.md §4.")
  .option("--list", "List the node ids in each syncability tier.")
  .option("--blockers", "Show the dependency-order readiness view: the syncable ideal (core nodes whose whole closure is core) + the fix-first blocker antichain ranked by how many nodes each blocks.")
  .option("--gray-zone", "Show the gray-zone index: nodes whose multi-draw regenerations disagreed with EACH OTHER (recorded by `onto sync`/`onto regenerate --draws N`), ranked most-ambiguous first — the repair-the-ficha-first queue. Reads .ontology/reports/gray-zone.json; draws nothing.")
  .option("--json", "Output the full report (incl. per-node detail + readiness + gray-zone ranking) as JSON.")
  .action(async (options) => {
    try {
      await statusCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during status: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("dod <nodeId>")
  .description("Per-node DEFINITION OF DONE, read-only: the three verification gates (structural F∘G, behaviour fixture, declared rules) in one view, plus trust-tier and downstream blast-radius. Rules are checked live ($0); structural + behaviour are measured against a CACHED regen (`.ontology/verify/<id>`) when one exists — else reported `unmeasured` (run `onto sync`). Writes nothing, dispatches no LLM.")
  .option("--no-run", "Skip the behaviour gate's fixture execution (the isolated child run). Structural still measures (pure file compare); behaviour reports `unmeasured`.")
  .option("--json", "Output the full DoD report as JSON.")
  .action(async (nodeId, options) => {
    try {
      // commander maps `--no-run` to options.run===false (default true).
      await dodCommand(nodeId, { json: options.json, noRun: options.run === false });
    } catch (err: unknown) {
      console.error(`✖ Error during dod: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("sync <nodeId>")
  .description("The governed intent→code loop in one command: regenerate the node's shadow from its intent (--draws 3 consensus), gate it through ALL three checks (structural verdict + behaviour fixture + declared rules), and only when every gate passes WRITE the shadow and re-anchor THIS node's drift; otherwise write nothing and report the precise blocking gate. A thin composition of `regenerate` + the gates + a per-node re-anchor (no new verification semantics). See docs/design/runtime/SYNC_LOOP_SPEC.md.")
  .option("--provider <provider>", "LLM provider override for the compile-back (mock|ollama|anthropic|gemini).")
  .option("--model <model>", "Model override (use with --provider).")
  .option("--ollama-host <host>", "Host for the Ollama provider.")
  .option("--draws <n>", "Multi-draw consensus: compile N independent drafts and write only the majority structural-agreement class. Default 3.", (v) => parseInt(v, 10))
  .option("--consensus <k>", "Consensus floor: write only when at least K of N draws agree (default strict majority, floor(N/2)+1).", (v) => parseInt(v, 10))
  .option("--loc-threshold <n>", "LoC distance threshold for the structural verdict (default 0.3).", (v) => parseFloat(v))
  .option("--jaccard-threshold <n>", "Structural Jaccard threshold for the verdict (default 0.5).", (v) => parseFloat(v))
  .option("--behavior-fixtures-dir <path>", "Override the behaviour-fixtures directory (default tests/behavior-fixtures).")
  .option("--dry-run", "Run the whole loop (regen + all gates) but write nothing and do not re-anchor — preview the decision.")
  .option("--explain", "Show the full reasoning behind the decision: draws/consensus, structural verdict + metrics, behaviour, rules.")
  .option("--no-lock", "Skip the .ontology/.lock advisory lock.")
  .option("--json", "Output the result as JSON.")
  .action(async (nodeId, rawOptions) => {
    try {
      const { lock, ...rest } = rawOptions as Record<string, unknown> & { lock?: boolean };
      const options = {
        ...rest,
        ...(lock === false ? { noLock: true } : {}),
      };
      await syncCommand(nodeId, options);
    } catch (err: unknown) {
      console.error(`✖ Error during sync: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("execute <nodeIds...>")
  .description("The governed EXECUTOR loop: for each node (and its dependency closure, in topological order) regenerate from intent, gate on behaviour, and DECIDE the next move — refine, decompose, or climb the model capability ladder — writing ONLY nodes that pass. Reports each node honestly as closed / extraction-gap (intention insufficient — flag G, not written) / capacity-ceiling / blocked-upstream / unverified-no-fixture. $0/local by default (paid models excluded from the ladder unless --allow-paid). See src/runtime/executor.")
  .option("--dry-run", "Run the whole loop (regen + gates + decisions) but write nothing — preview the decisions.")
  .option("--max-attempts <n>", "Hard backstop on attempts per node (default 8).", (v) => parseInt(v, 10))
  .option("--allow-paid", "Allow paid models into the capability ladder (default: $0 — paid models excluded).")
  .option("--max-cloud-attempts <n>", "Run-level budget on attempts at cloud rungs (the spend governor, B2). When exhausted, later nodes climb local-only; a quota/dead-provider infra failure also removes that provider's rungs for the rest of the run (B1).", (v) => parseInt(v, 10))
  .option("--no-precedents", "Ignore the episodic precedent store for this run (measure every node from scratch; fresh outcomes are still recorded). Default: warm-start κ* from the last run and honour extraction-gap precedents on unchanged fichas.")
  .option("--behavior-fixtures-dir <path>", "Override the behaviour-fixtures directory (default tests/behavior-fixtures).")
  .option("--ollama-host <host>", "Host for the Ollama provider.")
  .option("--json", "Output the full report as JSON.")
  .action(async (nodeIds, options) => {
    try {
      // commander maps `--no-precedents` to options.precedents === false.
      const { precedents, ...rest } = options as Record<string, unknown> & { precedents?: boolean };
      await executeCommand(nodeIds, { ...rest, ...(precedents === false ? { noPrecedents: true } : {}) });
    } catch (err: unknown) {
      console.error(`✖ Error during execute: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("repair <target>")
  .description("The ficha-repair lever (MVP regen loop, human-gated). `onto repair node_XXXX` runs one repair: parent baseline at a FIXED rung → an LLM repairer proposes an enriched ficha (R_strict never sees the source; R_perm may) → guards (JSON parse + injected-text budget) → node_update proposal + repair_proposed event → fork evaluation with the ficha overlaid (same rung, no write) → AUTHOR/CONFIRM flip diffs. `onto repair proposal_XXXX --promote|--discard` resolves it (apply/reject + audit event). `onto repair report` folds the log into the two MVP numbers: the strict↔perm gap and the human↔auto agreement rate (the v2 gate). Nothing mutates the node without --promote.")
  .option("--operator <mode>", "Repair operator: strict (spec-side only, the honest floor) or perm (may read the reference source, the ceiling). Default strict.")
  .option("--provider <provider>", "Generator provider for BOTH baseline and fork evaluation (the fixed rung). Required for runs.")
  .option("--model <model>", "Generator model override (fixed rung).")
  .option("--rung <n>", "Ladder rung index of the fixed rung (informational, recorded in the audit events).", (v) => parseInt(v, 10))
  .option("--repair-provider <provider>", "Repairer provider (default: the generator's). Pass a STRONGER one — repairing is G-side reasoning.")
  .option("--repair-model <model>", "Repairer model override.")
  .option("--draws <n>", "Draws per side (default 3 — the semanticSplit floor).", (v) => parseInt(v, 10))
  .option("--no-holdout", "Disable the AUTHOR/CONFIRM split (default: fixtures with ≥4 cases hold ~1/3 out of every prompt and report a held-out CONFIRM flip diff — the honest readout).")
  .option("--budget-chars <n>", "Injected-text budget: max chars the repair may ADD to the ficha surface (default 2000).", (v) => parseInt(v, 10))
  .option("--behavior-fixtures-dir <path>", "Override the behaviour-fixtures directory (default tests/behavior-fixtures).")
  .option("--ollama-host <host>", "Host for the Ollama provider.")
  .option("--max-tokens <n>", "Override max-output-tokens.", (v) => parseInt(v, 10))
  .option("--promote", "Resolve shape: apply the repair proposal (records repair_promoted).")
  .option("--discard", "Resolve shape: reject the repair proposal (records repair_discarded).")
  .option("--json", "Output the full report as JSON.")
  .action(async (target, options) => {
    try {
      await repairCommand(target, options);
    } catch (err: unknown) {
      console.error(`✖ Error during repair: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("probe <nodeId>")
  .description("Generate a SELF-VALIDATED behavioural fixture for a node: an LLM proposes characterization cases from the source + contract, each is run against the real source, and only the cases that cleanly match are persisted to tests/behavior-fixtures/<nodeId>.fixture.ts. The safety net for `onto regenerate --write` — a behavioural divergence (even a structurally-identical off-by-one) then blocks the write. Run under tsx (`npm run dev -- probe ...`).")
  .option("--provider <provider>", "LLM provider (mock|ollama|anthropic|gemini).")
  .option("--model <model>", "Model override (use with --provider).")
  .option("--ollama-host <host>", "Host for the Ollama provider.")
  .option("--force", "Replace an existing hand-written fixture (generated fixtures are always replaceable).")
  .option("--fixtures-dir <path>", "Override the behaviour-fixtures directory (default tests/behavior-fixtures).")
  .option("--max-tokens <n>", "Override max-output-tokens for the generation.", (v) => parseInt(v, 10))
  .option("--json", "Output the result as JSON.")
  .action(async (nodeId, options) => {
    try {
      await probeCommand(nodeId, options);
    } catch (err: unknown) {
      console.error(`✖ Error during probe: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const rulesCmd = program
  .command("rules")
  .description("Rule enforcement + triage for a node's `rules`. rules-grounding (LENS_LAWS E2) made rules round-trip as preserved text; this turns the statically-decidable ones into VERIFIED invariants, routes behavioural rules to `onto probe`, and flags prose/axiom/extraction-noise (a ficha-quality signal).");

rulesCmd
  .command("check <nodeId>")
  .description("Classify and check a node's rules against its compiled artifact (the shadow, or --regen <path>). Static forbid/require-symbol rules are verified deterministically; behavioural rules are routed to `onto probe`; prose is flagged. Exits non-zero on a static violation.")
  .option("--regen <path>", "Artifact to check against (default: the node's outputs.files shadow).")
  .option("--json", "Output the result as JSON.")
  .action(async (nodeId, options) => {
    try {
      await rulesCheckCommand(nodeId, options);
    } catch (err: unknown) {
      console.error(`✖ Error during rules check: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

rulesCmd
  .command("audit")
  .description("Classify every node's rules across the graph and report the distribution — statically enforceable / behavioural / meta / prose. The prose fraction is a ficha-quality signal (the `rules` field is where 3B extraction noise + canon axioms accumulate).")
  .option("--json", "Output the result as JSON.")
  .action(async (options) => {
    try {
      await rulesAuditCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during rules audit: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const fichaCmd = program
  .command("ficha")
  .description("Measure + fix the quality of a node's intent record (its 'ficha': prompt + contract + rules). The live graph was populated by a 3B extractor; every experiment pointed at ficha/extraction quality as the binding constraint. `audit` is the read-only measure-before-construct worklist; `cleanup` applies the one deterministic fix — completing the contract with the export surface the AST actually has.");

fichaCmd
  .command("audit")
  .description("Read-only ficha-quality report across the graph: contract thinness (AST exports the ficha under-declares), rule noise (prose/extraction-noise rules), and a ranked cleanup worklist.")
  .option("--top <n>", "How many worklist entries to show (default 12).", (v) => parseInt(v, 10))
  .option("--json", "Output the result as JSON.")
  .action(async (options) => {
    try {
      await fichaAuditCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during ficha audit: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

fichaCmd
  .command("cleanup <nodeId>")
  .description("Reconcile a node's contract with the export surface its source actually has (the deterministic, AST-derived fix for the thinness the bilateral round-trip measured). Completes the contract (adds AST exports the ficha under-declares) and, with --prune, removes phantom provides (imports/private symbols the ficha over-declares — the determinacy killer the sync-loop acceptance found). Preview by default; --apply mutates the node's provides. Prose-rule noise is reported, never auto-removed.")
  .option("--apply", "Apply the reconciliation to the node's provides (governed mutation via updateNode).")
  .option("--prune", "Also remove phantom provides — declared keys the source does NOT export (imported helpers or private symbols mislabelled as provides). Raises compile-back determinacy: phantom provides make draws disagree on the module surface, so consensus never forms.")
  .option("--json", "Output the result as JSON.")
  .action(async (nodeId, options) => {
    try {
      await fichaCleanupCommand(nodeId, options);
    } catch (err: unknown) {
      console.error(`✖ Error during ficha cleanup: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

const workflowCmd = program
  .command("workflow")
  .description("Phase ζ — workflow-runtime commands (load + execute typed-node workflow graphs with branches_on edges, structured verifier verdicts, and loop-with-stopping-criterion semantics). See docs/design/runtime/WORKFLOW_RUNTIME_SPEC.md.");

workflowCmd
  .command("run <graph>")
  .description("Run a workflow graph against an input file. Walks the graph node-by-node, dispatches each generator/verifier through the existing LLM dispatcher (model-agnostic), branches on verifier verdicts via the v0 predicate DSL, and emits a trace + accept/reject result.")
  .requiredOption("--input <path>", "Path to the input file whose contents seed the workflow's entry node.")
  .option("--max-steps <n>", "Maximum total node visits before the workflow rejects with `step_budget_exhausted`. Default 100.", (v) => parseInt(v, 10))
  .option("--trace <path>", "Write the full JSON trace to this path (in addition to the human-readable summary on stdout).")
  .option("--provider <provider>", "LLM provider override for every dispatch (mock, ollama, or anthropic). When omitted, per-node `model` fields and the dispatcher's task-default routing decide.")
  .option("--model <model>", "Model override for every dispatch (overrides per-node `model` fields).")
  .option("--ollama-host <host>", "Host for Ollama provider.")
  .option("--dry-run", "Validate the graph + input and emit a canned trace without any LLM dispatch. Useful for testing graph shapes before paying for tokens.")
  .option("--json", "Output the result as JSON to stdout.")
  .option("--as-proposal", "On an ACCEPTED run, turn the final artefact into a pending `node_create` proposal (review with `onto proposal apply`). Closes the execution→intent loop. Requires an initialised `.ontology/` project.")
  .option("--update-node <nodeId>", "With --as-proposal: propose a `node_update` of this EXISTING node instead of creating one — the artefact replaces its prompt and the resolved contract replaces its provides. Mutually exclusive with --proposal-level/--proposal-kind/--proposal-parent. Graph-declared `proposesEdges` become edge_create proposals alongside (apply edges first; the update rewrites the focal hash). See WORKFLOW_RUNTIME_SPEC §3.6.")
  .option("--proposal-level <level>", "Required with --as-proposal (create mode): abstraction level for the proposed node.")
  .option("--proposal-kind <kind>", "Required with --as-proposal: semantic kind for the proposed node.")
  .option("--proposal-parent <nodeId>", "Optional with --as-proposal: parent node id (defaults to the root canon).")
  .option("--proposal-label <label>", "Optional with --as-proposal: human label for the proposed node.")
  .option("--proposal-rationale <text>", "Optional with --as-proposal: rationale recorded in the proposal's provenance (defaults to a workflow-run note).")
  .action(async (graph, rawOptions) => {
    try {
      await workflowRunCommand(graph, rawOptions);
    } catch (err: unknown) {
      console.error(`✖ Error during workflow run: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
