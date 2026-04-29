import { Command } from 'commander';

import { registerInitCommand } from '../commands/init.js';
import { registerVersionCommand } from '../commands/version.js';
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
    .version(options.version)
    .showHelpAfterError('(run with --help for usage details)');

  registerInitCommand(program, {
    getCwd,
    write
  });

  registerVersionCommand(program, {
    version: options.version,
    write
  });

  return program;
}
