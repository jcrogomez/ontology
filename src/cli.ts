#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { validateCommand } from "./commands/validate.js";
import { inspectCommand } from "./commands/inspect.js";
import { createNodeCommand } from "./commands/node/create.js";
import { nodeListCommand } from "./commands/node/list.js";
import { nodeShowCommand } from "./commands/node/show.js";
import { eventsTailCommand } from "./commands/events/tail.js";
import { contextAssembleCommand } from "./commands/context/assemble.js";
import { runPromptCommand } from "./commands/run/prompt.js";
import { runContextCommand } from "./commands/run/context.js";
import { modelDoctorCommand } from "./commands/model/doctor.js";
import { modelListCommand } from "./commands/model/list.js";

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
      console.error(`✖ Error during init: ${(err as Error).message}`);
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
      console.error(`✖ Error during doctor: ${(err as Error).message}`);
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
      console.error(`✖ Error during validation: ${(err as Error).message}`);
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
      console.error(`✖ Error during inspection: ${(err as Error).message}`);
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
      console.error(`✖ Error listing nodes: ${(err as Error).message}`);
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
      console.error(`✖ Error showing node: ${(err as Error).message}`);
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
      console.error(`✖ Error during model doctor: ${(err as Error).message}`);
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
      console.error(`✖ Error listing models: ${(err as Error).message}`);
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
      console.error(`✖ Error tailing events: ${(err as Error).message}`);
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
  .action(async (id, options) => {
    try {
      await contextAssembleCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error assembling context: ${(err as Error).message}`);
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
  .option("--json", "Output results in JSON format")
  .action(async (id, options) => {
    try {
      await runContextCommand(id, options);
    } catch (err: unknown) {
      console.error(`✖ Error running context: ${(err as Error).message}`);
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
      console.error(`✖ Error running prompt: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
