import type { SymbolTable } from './symbolTable.js';
import type { Diagnostic } from './diagnostics.js';
import type { OSLView, RenderAST, RenderNode } from '../schemas/index.js';

export class SemanticLinker {
  constructor(private symbolTable: SymbolTable) {}

  public linkView(view: OSLView): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (let i = 0; i < view.domainEntities.length; i++) {
      const entity = view.domainEntities[i];
      if (entity && !this.symbolTable.entities.has(entity)) {
        diagnostics.push({
          severity: 'error',
          code: 'LINK_MISSING_ENTITY',
          message: `Domain entity '${entity}' not found in workspace`,
          path: ['domainEntities', i.toString()]
        });
      }
    }

    if (view.task && !this.symbolTable.tasks.has(view.task)) {
      diagnostics.push({
        severity: 'error',
        code: 'LINK_MISSING_TASK',
        message: `Task '${view.task}' not found in workspace`,
        path: ['task']
      });
    }

    for (let i = 0; i < view.components.length; i++) {
      const component = view.components[i];
      if (component && component.id && !this.symbolTable.components.has(component.id)) {
        diagnostics.push({
          severity: 'error',
          code: 'LINK_MISSING_COMPONENT',
          message: `Component '${component.id}' not found in registry`,
          path: ['components', i.toString(), 'id']
        });
      }
    }

    return diagnostics;
  }

  public linkRenderAST(ast: RenderAST): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (let i = 0; i < ast.entityRefs.length; i++) {
      const entity = ast.entityRefs[i];
      if (entity && !this.symbolTable.entities.has(entity)) {
        diagnostics.push({
          severity: 'error',
          code: 'LINK_MISSING_ENTITY',
          message: `Domain entity '${entity}' not found in workspace`,
          path: ['entityRefs', i.toString()]
        });
      }
    }

    if (ast.taskRef && !this.symbolTable.tasks.has(ast.taskRef)) {
      diagnostics.push({
        severity: 'error',
        code: 'LINK_MISSING_TASK',
        message: `Task '${ast.taskRef}' not found in workspace`,
        path: ['taskRef']
      });
    }

    const checkNode = (node: RenderNode, path: string[]) => {
      if (node.component && !this.symbolTable.components.has(node.component)) {
        diagnostics.push({
          severity: 'error',
          code: 'LINK_MISSING_COMPONENT',
          message: `Component '${node.component}' not found in registry`,
          path: [...path, 'component']
        });
      }
      if (node.children) {
        node.children.forEach((child, idx) => checkNode(child, [...path, 'children', idx.toString()]));
      }
    };

    ast.nodes.forEach((node, idx) => checkNode(node, ['nodes', idx.toString()]));

    for (let i = 0; i < ast.dataBindings.length; i++) {
      const binding = ast.dataBindings[i];
      if (binding && binding.source && binding.source.includes('.')) {
        if (!this.symbolTable.fields.has(binding.source)) {
          diagnostics.push({
            severity: 'error',
            code: 'LINK_MISSING_FIELD',
            message: `Field '${binding.source}' not found in workspace`,
            path: ['dataBindings', i.toString(), 'source']
          });
        }
      }
    }

    return diagnostics;
  }
}
