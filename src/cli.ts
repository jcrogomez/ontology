#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { validateCommand } from "./commands/validate.js";
import { inspectCommand } from "./commands/inspect.js";
import { createNodeCommand } from "./commands/node/create.js";

const program = new Command();

program
  .name("onto")
  .description("Ontology CLI: terminal-first multidimensional intention network editor.")
  .version("0.1.0");

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
  .action(async () => {
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

program.parse(process.argv);
