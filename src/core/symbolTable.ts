import type { WorkspaceContext } from './contextResolver.js';
import type { CanonRule, ComponentRegistryEntry, DomainEntity, Task, OSLView, RenderAST } from '../schemas/index.js';

export class SymbolTable {
  public entities: Map<string, DomainEntity> = new Map();
  public fields: Map<string, string> = new Map(); // entity.field
  public tasks: Map<string, Task> = new Map();
  public canonRules: Map<string, CanonRule> = new Map();
  public components: Map<string, ComponentRegistryEntry> = new Map();
  public componentProps: Map<string, string[]> = new Map(); // componentId -> prop names
  public componentEvents: Map<string, string[]> = new Map(); // componentId -> event names
  public views: Map<string, OSLView> = new Map();
  public renders: Map<string, RenderAST> = new Map();

  static fromWorkspace(workspace: WorkspaceContext): SymbolTable {
    const table = new SymbolTable();

    for (const entity of workspace.domainEntities) {
      table.entities.set(entity.name, entity);
      for (const field of entity.fields) {
        table.fields.set(`${entity.name}.${field.name}`, field.type);
      }
    }

    for (const task of workspace.tasks) {
      table.tasks.set(task.id, task);
    }

    for (const rule of workspace.canonRules) {
      table.canonRules.set(rule.id, rule);
    }

    for (const [id, component] of Object.entries(workspace.components)) {
      table.components.set(id, component);
      table.componentProps.set(id, Object.keys(component.propsSchema || {}));
      table.componentEvents.set(id, Object.keys(component.eventsSchema || {}));
    }

    for (const view of workspace.views) {
      table.views.set(view.id, view);
    }

    for (const render of workspace.renders) {
      table.renders.set(render.viewId, render);
    }

    return table;
  }
}
