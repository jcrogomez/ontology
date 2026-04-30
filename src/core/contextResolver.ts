import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

import {
  CanonSchema,
  ComponentRegistrySchema,
  DomainEntitySchema,
  OntologyConfigSchema,
  TaskSchema,
} from '../schemas/index.js';
import type {
  CanonRule,
  ComponentRegistryEntry,
  DomainEntity,
  OntologyConfig,
  Task,
  PromptPacket,
  ComponentPromptSummary
} from '../schemas/index.js';
import { pathExists, readYamlFile } from '../utils/fs.js';
import { validateOrThrow } from '../utils/validation.js';

export interface WorkspaceContext {
  config: OntologyConfig;
  canonRules: CanonRule[];
  domainEntities: DomainEntity[];
  tasks: Task[];
  components: Record<string, ComponentRegistryEntry>;
}

async function loadYamlFilesInDir<T>(
  dirPath: string,
  schema: any,
  label: string
): Promise<T[]> {
  if (!(await pathExists(dirPath))) {
    return [];
  }
  const files = await readdir(dirPath);
  const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
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

  return {
    config,
    canonRules,
    domainEntities,
    tasks,
    components
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
