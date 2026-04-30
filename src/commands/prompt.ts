import type { Command } from 'commander';
import * as p from '@clack/prompts';
import {
  branchPrompt,
  type HierarchyLevel,
  loadPromptGraph,
  savePromptGraph
} from '../core/promptGraph.js';

export interface PromptCommandOptions {
  getCwd: () => string;
  write: (text: string) => void;
}

const VALID_LEVELS: HierarchyLevel[] = [
  'project',
  'canon',
  'domain',
  'task',
  'view',
  'component'
];

export function registerPromptCommand(
  program: Command,
  options: PromptCommandOptions
): void {
  program
    .command('prompt <promptText>')
    .description('Versions a new prompt intent in the prompt graph without executing LLM logic')
    .requiredOption('--level <level>', `The semantic level of the prompt. One of: ${VALID_LEVELS.join(', ')}`)
    .option('--parent <nodeId>', 'The parent node id to branch from. Defaults to the current HEAD.')
    .action(
      async (
        promptText: string,
        commandOptions: {
          level: string;
          parent?: string;
        }
      ) => {
        const cwd = options.getCwd();

        if (!VALID_LEVELS.includes(commandOptions.level as HierarchyLevel)) {
          p.log.error(`Invalid level: ${commandOptions.level}. Must be one of: ${VALID_LEVELS.join(', ')}`);
          throw new Error();
        }

        let graph;
        try {
          graph = await loadPromptGraph(cwd);
        } catch (error: any) {
          p.log.error(error.message);
          throw new Error();
        }

        const parentId = commandOptions.parent || graph.head;

        if (!parentId) {
          p.log.error('Prompt graph has no HEAD. Run `onto init` or create a root prompt first.');
          throw new Error();
        }

        if (!graph.nodes[parentId]) {
          if (commandOptions.parent) {
            p.log.error(`Parent node ${parentId} not found in graph.`);
          } else {
            p.log.error('Prompt graph HEAD points to a missing node.');
          }
          throw new Error();
        }

        const newNode = branchPrompt(
          graph,
          parentId,
          promptText,
          commandOptions.level as HierarchyLevel,
          'developer' // Hardcoded author for MVP, could come from git/config later
        );

        await savePromptGraph(cwd, graph);

        p.log.success(`Created prompt node ${newNode.id} at level ${newNode.hierarchyLevel}`);
        options.write(newNode.id + '\n');
      }
    );
}
