import chalk from 'chalk';
import type { Command } from 'commander';

import { loadWorkspace } from '../core/contextResolver.js';
import { SemanticLinker } from '../core/linker.js';
import { SymbolTable } from '../core/symbolTable.js';
import type { Diagnostic } from '../core/diagnostics.js';

export interface DoctorCommandOptions {
  getCwd: () => string;
  write: (text: string) => void;
}

export function registerDoctorCommand(
  program: Command,
  options: DoctorCommandOptions
): void {
  program
    .command('doctor')
    .description('Run SemanticLinker across all OSL views and Render ASTs to verify workspace integrity')
    .action(async () => {
      const root = options.getCwd();
      let hasError = false;

      try {
        const workspace = await loadWorkspace(root);
        const symbolTable = SymbolTable.fromWorkspace(workspace);
        const linker = new SemanticLinker(symbolTable);

        for (const view of workspace.views) {
          const diagnostics = linker.linkView(view);
          if (diagnostics.length > 0) {
            printReport(`OSL View: ${view.id}`, diagnostics, options.write);
            if (diagnostics.some(d => d.severity === 'error' || d.severity === 'blocking')) {
              hasError = true;
            }
          }
        }

        for (const render of workspace.renders) {
          const diagnostics = linker.linkRenderAST(render);
          if (diagnostics.length > 0) {
            printReport(`Render AST: ${render.viewId}`, diagnostics, options.write);
            if (diagnostics.some(d => d.severity === 'error' || d.severity === 'blocking')) {
              hasError = true;
            }
          }
        }

        if (hasError) {
          process.exit(1);
        } else {
          process.exit(0);
        }
      } catch (error) {
        options.write(chalk.red(`\nFailed to run doctor command.\n`));
        options.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });
}

function printReport(title: string, diagnostics: Diagnostic[], write: (text: string) => void): void {
  const header = `=== DIAGNOSTIC REPORT: ${title} `.padEnd(56, '=');
  write(`\n${chalk.bold(header)}\n\n`);

  for (const diag of diagnostics) {
    const isError = diag.severity === 'error' || diag.severity === 'blocking';
    const icon = isError ? chalk.red('✖') : chalk.yellow('⚠');
    const severityLabel = isError ? chalk.red(`[${diag.severity.toUpperCase()}]`) : chalk.yellow(`[${diag.severity.toUpperCase()}]`);
    const code = diag.code;

    write(`  ${icon} ${severityLabel} ${code}\n`);
    write(`    Path:    ${chalk.cyan(diag.path.join('.'))}\n`);
    write(`    Message: ${diag.message}\n`);
    if (diag.suggestion) {
      write(`    Suggest: ${diag.suggestion}\n`);
    }
    write('\n');
  }

  const footer = ''.padEnd(56, '=');
  write(`${chalk.bold(footer)}\n`);
}
