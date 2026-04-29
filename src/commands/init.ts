import type { Command } from 'commander';

import { initOntologyProject } from '../core/init.js';

export interface InitCommandOptions {
  getCwd: () => string;
  write: (text: string) => void;
}

export function registerInitCommand(
  program: Command,
  options: InitCommandOptions
): void {
  program
    .command('init [projectName]')
    .description('Initialize an Ontology project scaffold')
    .action(async (projectName?: string) => {
      const result = await initOntologyProject({
        cwd: options.getCwd(),
        ...(projectName === undefined ? {} : { projectName })
      });

      options.write(`Initialized Ontology project in ${result.projectRoot}\n`);
      options.write('Next steps:\n');

      for (const [index, step] of result.nextSteps.entries()) {
        options.write(`${index + 1}. \`${step}\`\n`);
      }
    });
}
