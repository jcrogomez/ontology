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
import { eventsTailCommand } from "./commands/events/tail.js";
import { contextAssembleCommand } from "./commands/context/assemble.js";
import { runPromptCommand } from "./commands/run/prompt.js";
import { runContextCommand } from "./commands/run/context.js";
import { runsListCommand } from "./commands/runs/list.js";
import { runsShowCommand } from "./commands/runs/show.js";
import { runsVerifyCommand } from "./commands/runs/verify.js";
import { walkCommand } from "./commands/walk.js";
import { proposeNodeCommand } from "./commands/proposal/propose-node.js";
import { modelDoctorCommand } from "./commands/model/doctor.js";
import { modelListCommand } from "./commands/model/list.js";
import { errorMessage } from "./core/errors.js";

const program = new Command();

program
  .name("onto")
  .description("Ontology CLI: terminal-first multidimensional intention network editor.")
  .version("0.2.0-alpha.1");

program
  .command("init")
  .description("Initializes a new Ontology Network Kernel.")
  .action(async () => {
    try {
      await initCommand();
    } catch (err: unknown) {
      console.error(`✖ Error during init: ${errorMessage(err)}`);
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

program.parse(process.argv);
