import type { Command } from 'commander';

import {
  MockLLMProvider,
  OllamaLLMProvider
} from '../llm/ollamaProvider.js';
import { runSemanticParser } from '../core/plan.js';

export interface PlanCommandOptions {
  getCwd: () => string;
  write: (text: string) => void;
}

export function registerPlanCommand(
  program: Command,
  options: PlanCommandOptions
): void {
  program
    .command('plan <naturalLanguageIntent>')
    .description('Convert natural-language interface intent into an OSL view')
    .option('--mock', 'Use deterministic mock LLM responses')
    .option('--dry-run', 'Print the generated OSL YAML without writing it')
    .option('--model <model>', 'Override the configured Ollama model')
    .action(
      async (
        naturalLanguageIntent: string,
        commandOptions: {
          dryRun?: boolean;
          mock?: boolean;
          model?: string;
        },
        command: Command
      ) => {
        const globalOptions = command.parent?.opts() as
          | { mock?: boolean }
          | undefined;
        const useMock = commandOptions.mock === true || globalOptions?.mock === true;
        const provider = useMock
          ? new MockLLMProvider()
          : new OllamaLLMProvider({
              root: options.getCwd(),
              ...(commandOptions.model === undefined
                ? {}
                : { model: commandOptions.model })
            });
        const result = await runSemanticParser({
          naturalLanguageIntent,
          provider,
          root: options.getCwd(),
          ...(commandOptions.dryRun === true ? { dryRun: true } : {}),
          ...(commandOptions.model === undefined
            ? {}
            : { model: commandOptions.model })
        });

        for (const line of result.pipeline) {
          options.write(`${line}\n`);
        }

        if (commandOptions.dryRun === true) {
          options.write('\n');
          options.write(result.yaml);
        }
      }
    );
}
