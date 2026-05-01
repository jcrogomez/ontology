#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { validateCommand } from "./commands/validate.js";
import { inspectCommand } from "./commands/inspect.js";
import { createNodeCommand } from "./commands/node/create.js";
import { nodeListCommand } from "./commands/node/list.js";
import { nodeShowCommand } from "./commands/node/show.js";

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
    if (options.json) {
      console.log(JSON.stringify({ status: "NotImplemented", module: "doctor" }));
      process.exit(0);
    } else {
      console.log("Not implemented: doctor");
      process.exit(0);
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
    if (options.json) {
      console.log(JSON.stringify({ status: "pending_json_implementation", message: "JSON output for inspect is under construction" }));
      process.exit(0);
    }
    try {
      await inspectCommand();
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

const events = program
  .command("events")
  .description("Manage Ontology events.");

events
  .command("tail")
  .description("Tail the events log.")
  .option("--json", "Output results in JSON format")
  .option("--limit <number>", "Number of events to tail")
  .action(async (options) => {
    if (options.json) {
      console.log(JSON.stringify({ status: "NotImplemented", module: "events tail" }));
      process.exit(0);
    } else {
      console.log("Not implemented: events tail");
      process.exit(0);
    }
  });

program.parse(process.argv);
