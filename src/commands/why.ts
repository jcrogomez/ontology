import { join } from 'node:path';

import type { Command } from 'commander';

import { loadWorkspace } from '../core/contextResolver.js';
import { SymbolTable } from '../core/symbolTable.js';
import type { RenderNode } from '../schemas/index.js';

export interface WhyCommandOptions {
  getCwd: () => string;
  write: (text: string) => void;
}

export function registerWhyCommand(
  program: Command,
  options: WhyCommandOptions
): void {
  program
    .command('why <viewId> [componentId]')
    .description('Provide absolute lineage tracing for any node or component in the compiled UI')
    .action(async (viewId: string, componentId?: string) => {
      const root = options.getCwd();
      const workspace = await loadWorkspace(root);
      const symbolTable = SymbolTable.fromWorkspace(workspace);

      const view = symbolTable.views.get(viewId);
      const renderAst = symbolTable.renders.get(viewId);

      if (!view || !renderAst) {
        options.write(`✖ [ERROR] VIEW_NOT_FOUND\n  View ID '${viewId}' does not exist or has not been fully compiled.\n`);
        process.exit(1);
      }

      if (!componentId) {
        // Macro View
        const actor = view.actor;
        const taskId = view.task;
        const task = symbolTable.tasks.get(taskId);
        const taskGoal = task ? task.goal : 'Unknown task';

        options.write(`=== ONTOLOGICAL TOPOLOGY ==============================\n`);
        options.write(`VIEW:      [${viewId}]\n`);
        options.write(`ACTOR:     ${actor}\n`);
        options.write(`TASK:      ${taskId} - ${taskGoal}\n`);
        options.write(`=======================================================\n\n`);

        options.write(`[ DOMAINS INVOLVED ]\n`);
        if (view.domainEntities.length === 0) {
          options.write(`  (None)\n`);
        } else {
          for (const domain of view.domainEntities) {
            options.write(`  - ${domain}\n`);
          }
        }
        options.write(`\n`);

        options.write(`[ CANON LAWS ]\n`);
        // In macro view, we might not have a direct link from view to canon rules except via tasks, but we can list all constraints on the task or components if we wanted to.
        // For now, let's keep it simple or trace via tasks if needed. Wait, we just need to show the index of nodes.
        // Let's get the nodes index.
        const nodesIndex: string[] = [];
        const extractNodes = (nodes: RenderNode[]) => {
          for (const node of nodes) {
            nodesIndex.push(`  - ${node.id} (${node.component})`);
            if (node.children) {
              extractNodes(node.children);
            }
          }
        };
        extractNodes(renderAst.nodes);

        options.write(`[ PHYSICAL INDEX ]\n`);
        options.write(`To audit a specific node: \`onto why ${viewId} [componentId]\`\n`);
        for (const nodeStr of nodesIndex) {
          options.write(`${nodeStr}\n`);
        }
        options.write(`\n=======================================================\n`);
      } else {
        // Micro View (Node Lineage)
        let targetNode: RenderNode | null = null;
        const findNode = (nodes: RenderNode[]) => {
          for (const node of nodes) {
            if (node.id === componentId) {
              targetNode = node;
              return;
            }
            if (node.children) {
              findNode(node.children);
            }
          }
        };
        findNode(renderAst.nodes);

        if (targetNode === null) {
          options.write(`✖ [ERROR] NODE_NOT_FOUND\n  Component ID '${componentId}' does not exist in the RenderAST for view '${viewId}'.\n  Use \`onto why ${viewId}\` to see a list of valid materialized nodes.\n`);
          process.exit(1);
        }

        const componentType = (targetNode as RenderNode).component;
        const componentRegistryEntry = symbolTable.components.get(componentType);

        options.write(`=== ONTOLOGICAL LINEAGE ===============================\n`);
        options.write(`TARGET:    [${viewId}] -> ${componentType}\n`);
        options.write(`ACTOR:     ${view.actor}\n`);
        options.write(`TASK:      ${view.task}\n`);
        options.write(`=======================================================\n\n`);

        options.write(`[ MATERIALIZATION ]\n`);
        options.write(`PHYSICAL:  src/generated/views/${viewId}.tsx\n`);
        options.write(`NODE ID:   ${componentId}\n\n`);

        // Find domain bindings where target contains the componentId (e.g. node_id.props.something)
        const relevantBindings = renderAst.dataBindings.filter(b => b.target.startsWith(`${componentId}.`));

        options.write(`[ DOMAIN BINDING ]\n`);
        if (relevantBindings.length === 0) {
          options.write(`  (No direct data bindings found for this node)\n\n`);
        } else {
          for (const binding of relevantBindings) {
            options.write(`SOURCE:    ${binding.source}\n`);
            options.write(`TARGET:    ${binding.target}\n`);
            options.write(`NATURE:    Read-Only\n`); // Assuming Read-Only for simple data bindings, would need more context for read/write
            options.write(`\n`);
          }
        }

        options.write(`[ CANON CONSTRAINTS ]\n`);
        if (componentRegistryEntry && componentRegistryEntry.constraints && componentRegistryEntry.constraints.length > 0) {
          for (const constraintId of componentRegistryEntry.constraints) {
            const rule = symbolTable.canonRules.get(constraintId);
            options.write(`RULE ID:   ${constraintId}\n`);
            if (rule) {
              options.write(`SEVERITY:  ${rule.severity.toUpperCase()}\n`);
              // Wrap text nicely for description
              const descriptionWords = rule.description.split(' ');
              let currentLine = `DICTATES:  "`;
              for (const word of descriptionWords) {
                if (currentLine.length + word.length + 1 > 70 && currentLine !== `DICTATES:  "`) {
                  options.write(`${currentLine}\n`);
                  currentLine = `            ${word}`;
                } else {
                  currentLine += (currentLine === `DICTATES:  "` ? '' : ' ') + word;
                }
              }
              options.write(`${currentLine}"\n\n`);
            } else {
              options.write(`SEVERITY:  UNKNOWN\n`);
              options.write(`DICTATES:  (Rule definition not found)\n\n`);
            }
          }
        } else {
          options.write(`  (No specific canon constraints registered for component '${componentType}')\n\n`);
        }

        options.write(`=======================================================\n`);
      }
    });
}
