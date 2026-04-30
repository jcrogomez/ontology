import { Command } from 'commander';

import { registerContextCommand } from '../commands/context.js';
import { registerBuildCommand } from '../commands/build.js';
import { registerInitCommand } from '../commands/init.js';
import { registerPlanCommand } from '../commands/plan.js';
import { registerVersionCommand } from '../commands/version.js';
import { registerWhyCommand } from '../commands/why.js';
import { registerDoctorCommand } from '../commands/doctor.js';
import { CLI_DESCRIPTION, CLI_NAME } from '../core/meta.js';

export interface CliProgramOptions {
  getCwd?: () => string;
  version: string;
  write?: (text: string) => void;
}

export function createCliProgram(options: CliProgramOptions): Command {
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const getCwd = options.getCwd ?? (() => process.cwd());
  const program = new Command();

  program
    .name(CLI_NAME)
    .description(CLI_DESCRIPTION)
    .option(
      '--mock',
      'Use deterministic mock LLM responses for upcoming LLM-backed commands'
    )
    .version(options.version)
    .showHelpAfterError('(run with --help for usage details)');

  registerContextCommand(program, {
    getCwd,
    write
  });

  registerInitCommand(program, {
    getCwd,
    write
  });

  registerPlanCommand(program, {
    getCwd,
    write
  });

  registerBuildCommand(program, {
    getCwd,
    write
  });

  registerWhyCommand(program, {
  registerDoctorCommand(program, {
    getCwd,
    write
  });

  registerVersionCommand(program, {
    version: options.version,
    write
  });

  return program;
}
