#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { validateCommand } from "./commands/validate.js";
import { inspectCommand } from "./commands/inspect.js";
import { createNodeCommand } from "./commands/node/create.js";
import { nodeListCommand } from "./commands/node/list.js";
import { nodeShowCommand } from "./commands/node/show.js";
import { nodeLinkCommand } from "./commands/node/link.js";
import { nodeUpdateCommand } from "./commands/node/update.js";
import { nodeRemoveCommand } from "./commands/node/remove.js";
import { edgeRemoveCommand } from "./commands/edge/remove.js";
import { edgeUpdateCommand } from "./commands/edge/update.js";
import { eventsTailCommand } from "./commands/events/tail.js";
import { contextAssembleCommand } from "./commands/context/assemble.js";
import { runPromptCommand } from "./commands/run/prompt.js";
import { runContextCommand } from "./commands/run/context.js";
import { runsListCommand } from "./commands/runs/list.js";
import { runsShowCommand } from "./commands/runs/show.js";
import { runsVerifyCommand } from "./commands/runs/verify.js";
import { walkCommand } from "./commands/walk.js";
import { graphNeighborsCommand } from "./commands/graph/neighbors.js";
import { graphPathCommand } from "./commands/graph/path.js";
import { graphSubgraphCommand } from "./commands/graph/subgraph.js";
import { graphInferEdgesCommand } from "./commands/graph/infer-edges.js";
import { branchListCommand } from "./commands/branch/list.js";
import { branchFiberCommand } from "./commands/branch/fiber.js";
import { linkCommand } from "./commands/link/index.js";
import { proposeNodeCommand } from "./commands/proposal/propose-node.js";
import { proposeLinkCommand } from "./commands/proposal/propose-link.js";
import { compilePlanCommand } from "./commands/compile/plan.js";
import { compileRunCommand } from "./commands/compile/run.js";
import { compileRunBatchCommand } from "./commands/compile/run-batch.js";
import { ingestCommand } from "./commands/ingest/index.js";
import { proposalListCommand } from "./commands/proposal/list.js";
import { proposalShowCommand } from "./commands/proposal/show.js";
import { proposalRejectCommand } from "./commands/proposal/reject.js";
import { proposalApplyCommand } from "./commands/proposal/apply.js";
import { modelDoctorCommand } from "./commands/model/doctor.js";
import { modelListCommand } from "./commands/model/list.js";
import { registerQueryCommand } from "./commands/query/index.js";
import { openCommand } from "./commands/open.js";
import { projectsListCommand } from "./commands/projects/list.js";
import { projectsForgetCommand } from "./commands/projects/forget.js";
import { errorMessage } from "./core/errors.js";

const program = new Command();

program
  .name("onto")
  .description("Ontology CLI: terminal-first multidimensional intention network editor.")
  .version("0.3.0-alpha.0");

program
  .command("init")
  .description("Initializes a new Ontology Network Kernel.")
  .option("--name <name>", "Friendly name for the global project registry (defaults to the cwd basename)")
  .action(async (options) => {
    try {
      await initCommand({ name: options.name });
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
  .description("Read-only traversal queries over the typed graph (neighbors, path, subgraph).");

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
  .description("Project Legend γ-4: walk a TypeScript directory and print the import-derived edge graph (depends_on for value imports, uses_token for type imports). Pure static analysis — no LLM, no graph state mutated. Preview surface for the multi-file `onto ingest <directory>` (γ-5).")
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
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
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
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      await compileRunBatchCommand(options);
    } catch (err: unknown) {
      console.error(`✖ Error during compile run-batch: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

program
  .command("ingest <path>")
  .description("Project Legend γ-1 + γ-5: extract structured intent from source code. <path> may be a single file (produces one node_create proposal) or a directory (walks every .ts/.tsx, produces one proposal per file, also reports static-inferred cross-file edges via γ-4). Defaults to provider=anthropic (requires ANTHROPIC_API_KEY). Use --dry-run to preview without committing — load-bearing for iterating the extraction template at zero cost via the mock provider.")
  .option("--provider <provider>", "LLM provider override: anthropic (default), ollama, or mock.")
  .option("--model <model>", "Model override. For anthropic, defaults to claude-opus-4-7.")
  .option("--ollama-host <host>", "Host for Ollama provider.")
  .option("--parent <nodeId>", "Parent node id for the proposed node. Defaults to the project root canon.")
  .option("--dry-run", "Dispatch + parse + print the extraction, but do NOT create a proposal. Use to iterate the extraction template without piling up rejected proposals.")
  .option("--json", "Output results in JSON format.")
  .action(async (file, options) => {
    try {
      await ingestCommand(file, options);
    } catch (err: unknown) {
      console.error(`✖ Error during ingest: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

registerQueryCommand(program);

program.parse(process.argv);
