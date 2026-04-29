import type { Command } from 'commander';

export interface VersionCommandOptions {
  version: string;
  write: (text: string) => void;
}

export function registerVersionCommand(
  program: Command,
  options: VersionCommandOptions
): void {
  program
    .command('version')
    .description('Display the onto CLI version')
    .action(() => {
      options.write(`${options.version}\n`);
    });
}
