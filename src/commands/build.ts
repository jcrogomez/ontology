import { join } from 'node:path';

import * as p from '@clack/prompts';
import type { Command } from 'commander';

import { generateReactComponent } from '../compiler/reactGenerator.js';
import { loadWorkspace } from '../core/contextResolver.js';
import { RenderASTSchema } from '../schemas/index.js';
import { readYamlFile } from '../utils/fs.js';
import { validateOrThrow } from '../utils/validation.js';

export interface BuildCommandOptions {
  getCwd: () => string;
  write: (text: string) => void;
}

export function registerBuildCommand(
  program: Command,
  options: BuildCommandOptions
): void {
  program
    .command('build <viewId>')
    .description('Compile a given view AST into a React functional component')
    .action(async (viewId: string) => {
      const root = options.getCwd();

      p.intro('Ecolístico React Compiler');
      const s = p.spinner();
      s.start(`Building view ${viewId}...`);

      try {
        const workspace = await loadWorkspace(root);

        const astPath = join(root, workspace.config.paths.viewsDir, `${viewId}.ast.yaml`);
        const rawAst = await readYamlFile<unknown>(astPath);
        const ast = validateOrThrow(RenderASTSchema, rawAst, 'Render AST');

        const outputPath = join(root, workspace.config.paths.generatedViewsDir, `${viewId}.tsx`);

        await generateReactComponent(ast, workspace.components, outputPath, root);

        s.stop(`Compiled view ${viewId} successfully.`);
        p.outro(`Saved React component to: ${outputPath}`);
      } catch (error) {
        s.stop(`Failed to build view ${viewId}.`);
        p.outro(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
