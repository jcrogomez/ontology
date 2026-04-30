import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

import {
  CanonSchema,
  ComponentRegistrySchema,
  DomainEntitySchema,
  OntologyConfigSchema,
  TaskSchema,
  OSLViewSchema,
  RenderASTSchema
} from '../schemas/index.js';
import type {
  CanonRule,
  ComponentRegistryEntry,
  DomainEntity,
  OntologyConfig,
  Task,
  PromptPacket,
  ComponentPromptSummary,
  OSLView,
  RenderAST
} from '../schemas/index.js';
import { pathExists, readYamlFile } from '../utils/fs.js';
import { validateOrThrow } from '../utils/validation.js';

export interface WorkspaceContext {
  config: OntologyConfig;
  canonRules: CanonRule[];
  domainEntities: DomainEntity[];
  tasks: Task[];
  components: Record<string, ComponentRegistryEntry>;
  views: OSLView[];
  renders: RenderAST[];
}

async function loadYamlFilesInDir<T>(
  dirPath: string,
  schema: any,
  label: string,
  filterExtension?: string
): Promise<T[]> {
  if (!(await pathExists(dirPath))) {
    return [];
  }
  const files = await readdir(dirPath);
  const extFilter = filterExtension || '.yaml';
  const yamlFiles = filterExtension ? files.filter(f => f.endsWith(extFilter)) : files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const results: T[] = [];
  for (const file of yamlFiles) {
    const fullPath = join(dirPath, file);
    const content = await readYamlFile<unknown>(fullPath);
    results.push(validateOrThrow(schema, content, `${label} (${file})`));
  }
  return results;
}

export async function loadWorkspace(cwd: string): Promise<WorkspaceContext> {
  const configPath = join(cwd, 'ontology', 'ontology.config.yaml');
  const rawConfig = await readYamlFile<unknown>(configPath);
  const config = validateOrThrow(OntologyConfigSchema, rawConfig, 'Ontology config');

  const componentsDir = join(cwd, config.paths.componentsDir);
  const registries = await loadYamlFilesInDir<any>(componentsDir, ComponentRegistrySchema, 'Component registry');
  const components: Record<string, ComponentRegistryEntry> = {};
  for (const registry of registries) {
    Object.assign(components, registry.components);
  }

  const canonDir = join(cwd, config.paths.canonDir);
  const canons = await loadYamlFilesInDir<any>(canonDir, CanonSchema, 'Canon');
  const canonRules: CanonRule[] = [];
  for (const canon of canons) {
    canonRules.push(...canon.rules);
  }

  const domainDir = join(cwd, config.paths.domainDir);
  const domainEntities = await loadYamlFilesInDir<DomainEntity>(domainDir, DomainEntitySchema, 'Domain entity');

  const tasksDir = join(cwd, config.paths.tasksDir);
  const tasks = await loadYamlFilesInDir<Task>(tasksDir, TaskSchema, 'Task');

  const viewsDir = join(cwd, config.paths.viewsDir);
  let views: OSLView[] = [];
  let renders: RenderAST[] = [];

  if (await pathExists(viewsDir)) {
    const files = await readdir(viewsDir);
    for (const file of files) {
      if (file.endsWith('.osl.yaml') || file.endsWith('.osl.yml')) {
        const fullPath = join(viewsDir, file);
        const content = await readYamlFile<unknown>(fullPath);
        views.push(validateOrThrow(OSLViewSchema, content, `OSL View (${file})`));
      } else if (file.endsWith('.ast.yaml') || file.endsWith('.ast.yml')) {
        const fullPath = join(viewsDir, file);
        const content = await readYamlFile<unknown>(fullPath);
        renders.push(validateOrThrow(RenderASTSchema, content, `Render AST (${file})`));
      }
    }
  }
  const views = await loadYamlFilesInDir<OSLView>(viewsDir, OSLViewSchema, 'OSL View', '.osl.yaml');
  const renders = await loadYamlFilesInDir<RenderAST>(viewsDir, RenderASTSchema, 'Render AST', '.ast.yaml');

  return {
    config,
    canonRules,
    domainEntities,
    tasks,
    components,
    views,
    renders
  };
}

export function buildPromptPacket(workspace: WorkspaceContext, intent: string): PromptPacket {
  const isIde = /(compile|build|workspace|view|ide|node|graph)/i.test(intent);

  let filteredDomains = workspace.domainEntities;
  let filteredTasks = workspace.tasks;
  let filteredComponentEntries = Object.values(workspace.components);

  if (isIde) {
    const requiredDomains = ['Workspace', 'Pipeline'];
    const requiredTasks = ['trigger_compilation', 'shift_abstraction_level'];
    const requiredComponents = [
      'Screen',
      'CodeViewer',
      'TerminalPanel',
      'GraphVisualizer',
      'StatusBadge',
      'SplitPane',
      'TopologicalMinimap',
      'NodeCard'
    ];

    const missingEntities: string[] = [];

    // Filter Domains
    filteredDomains = workspace.domainEntities.filter(d => requiredDomains.includes(d.name));
    const foundDomains = filteredDomains.map(d => d.name);
    for (const d of requiredDomains) {
      if (!foundDomains.includes(d)) {
        missingEntities.push(`Domain('${d}')`);
      }
    }

    // Filter Tasks
    filteredTasks = workspace.tasks.filter(t => requiredTasks.includes(t.id));
    const foundTasks = filteredTasks.map(t => t.id);
    for (const t of requiredTasks) {
      if (!foundTasks.includes(t)) {
        missingEntities.push(`Task('${t}')`);
      }
    }

    // Filter Components
    const allowedComponentIds = new Set(requiredComponents);
    filteredComponentEntries = filteredComponentEntries.filter(c => allowedComponentIds.has(c.id));
    const foundComponents = new Set(filteredComponentEntries.map(c => c.id));
    for (const c of requiredComponents) {
      if (!foundComponents.has(c)) {
        missingEntities.push(`Component('${c}')`);
      }
    }

    if (missingEntities.length > 0) {
      throw new Error(`Semantic context resolution failed. The following required entities are missing from the workspace: ${missingEntities.join(', ')}.`);
    }
  }

  const componentSummaries: ComponentPromptSummary[] = filteredComponentEntries.map(c => ({
    id: c.id,
    semanticType: c.semanticType,
    purpose: c.purpose,
    propsSchema: c.propsSchema,
    eventsSchema: c.eventsSchema,
    constraints: c.constraints,
    supportedTargets: c.supportedTargets,
    compilerMetadata: {
      implementationPath: c.implementationPath
    }
  }));

  return {
    intent,
    canonRules: workspace.canonRules,
    domainEntities: filteredDomains,
    tasks: filteredTasks,
    componentSummaries,
    tokenSummaries: [],
    target: workspace.config.defaultTarget
  };
}
