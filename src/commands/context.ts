import type { Command } from 'commander';
import { stringify } from 'yaml';

import { buildPromptPacket, loadWorkspace } from '../core/contextResolver.js';

export interface ContextCommandOptions {
  getCwd: () => string;
  write: (text: string) => void;
}

export function registerContextCommand(
  program: Command,
  options: ContextCommandOptions
): void {
  program
    .command('context <intent>')
    .description('Resolve relevant ontology context and print a compact YAML packet')
    .option('--dry-run', 'Print the compact prompt packet as YAML for debugging')
    .action(async (intent: string) => {
      const workspace = await loadWorkspace(options.getCwd());
      const packet = buildPromptPacket(workspace, intent);

      options.write(`${stringify(packet)}`);
    });
}
