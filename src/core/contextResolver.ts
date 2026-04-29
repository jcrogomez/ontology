import { readdir } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

import { z } from 'zod';

import type {
  Canon,
  CanonRule,
  ComponentRegistry,
  ComponentRegistryEntry,
  DomainEntity,
  OntologyConfig,
  Task
} from '../schemas/index.js';
import {
  CanonSchema,
  ComponentRegistrySchema,
  DomainEntitySchema,
  OntologyConfigSchema,
  TaskSchema
} from '../schemas/index.js';
import { readYamlFile } from '../utils/fs.js';
import { validateOrThrow } from '../utils/validation.js';

const HARVEST_INTENT_TERMS = [
  'harvest',
  'cosecha',
  'peso',
  'weight',
  'merma',
  'variance'
] as const;

const HARVEST_ENTITY_IDS = ['harvest_batch', 'inventory_lot'] as const;
const HARVEST_TASK_IDS = ['confirm_harvest_batch'] as const;
const HARVEST_COMPONENT_IDS = [
  'Screen',
  'HeaderSummary',
  'NumericWeightInput',
  'VarianceAlert',
  'StickyPrimaryButton',
  'OfflineSyncBadge'
] as const;

const TokenFileSchema = z.record(z.unknown());

export interface WorkspaceTokenFile {
  id: string;
  path: string;
  value: Record<string, unknown>;
}

export interface WorkspaceContext {
  rootDir: string;
  config: OntologyConfig;
  canon: Canon[];
  domainEntities: DomainEntity[];
  tasks: Task[];
  componentRegistry: ComponentRegistry;
  tokens: WorkspaceTokenFile[];
}

export interface RelevantContext {
  canonRules: CanonRule[];
  domainEntities: DomainEntity[];
  tasks: Task[];
  components: ComponentRegistryEntry[];
  tokens: WorkspaceTokenFile[];
}

export interface ComponentPromptSummary {
  id: string;
  semanticType: string;
  purpose: string;
  propsSchema: Record<string, unknown>;
  eventsSchema: Record<string, unknown>;
  constraints: string[];
  supportedTargets: string[];
  compilerMetadata?: {
    implementationPath: string;
  } | undefined;
}

export interface TokenPromptSummary {
  id: string;
  summary: Record<string, unknown>;
  keys: string[];
  compilerMetadata: {
    path: string;
  };
}

export interface PromptPacket {
  intent: string;
  canonRules: CanonRule[];
  domainEntities: DomainEntity[];
  tasks: Task[];
  componentSummaries: ComponentPromptSummary[];
  tokenSummaries: TokenPromptSummary[];
  target: string;
}

export async function loadWorkspace(cwd: string): Promise<WorkspaceContext> {
  const rootDir = resolve(cwd);
  const configPath = join(rootDir, 'ontology', 'ontology.config.yaml');
  const config = validateOrThrow(
    OntologyConfigSchema,
    await readYamlFile<unknown>(configPath),
    configPath
  );

  const [canon, domainEntities, tasks, componentRegistry, tokens] =
    await Promise.all([
      loadValidatedYamlDirectory(rootDir, config.paths.canonDir, CanonSchema),
      loadValidatedYamlDirectory(
        rootDir,
        config.paths.domainDir,
        DomainEntitySchema
      ),
      loadValidatedYamlDirectory(rootDir, config.paths.tasksDir, TaskSchema),
      loadMergedComponentRegistry(rootDir, config.paths.componentsDir),
      loadTokenFiles(rootDir, config.paths.tokensDir)
    ]);

  return {
    rootDir,
    config,
    canon,
    domainEntities,
    tasks,
    componentRegistry,
    tokens
  };
}

export function findRelevantContext(
  workspace: WorkspaceContext,
  intent: string
): RelevantContext {
  const normalizedIntent = intent.toLocaleLowerCase();

  if (isHarvestIntent(normalizedIntent)) {
    return {
      canonRules: workspace.canon.flatMap((entry) => entry.rules),
      domainEntities: workspace.domainEntities.filter((entity) =>
        matchesAnyIdentifier(entity.id, entity.name, HARVEST_ENTITY_IDS)
      ),
      tasks: workspace.tasks.filter((task) =>
        matchesAnyIdentifier(task.id, task.goal, HARVEST_TASK_IDS)
      ),
      components: Object.values(workspace.componentRegistry.components).filter(
        (component) => isHarvestComponentId(component.id)
      ),
      tokens: workspace.tokens
    };
  }

  return {
    canonRules: workspace.canon.flatMap((entry) => entry.rules),
    domainEntities: workspace.domainEntities,
    tasks: workspace.tasks,
    components: Object.values(workspace.componentRegistry.components),
    tokens: workspace.tokens
  };
}

export function buildPromptPacket(
  workspace: WorkspaceContext,
  intent: string
): PromptPacket {
  const relevantContext = findRelevantContext(workspace, intent);

  return {
    intent,
    canonRules: relevantContext.canonRules,
    domainEntities: relevantContext.domainEntities,
    tasks: relevantContext.tasks,
    componentSummaries: relevantContext.components.map((component) => ({
      id: component.id,
      semanticType: component.semanticType,
      purpose: component.purpose,
      propsSchema: component.propsSchema,
      eventsSchema: component.eventsSchema,
      constraints: component.constraints,
      supportedTargets: component.supportedTargets,
      ...(component.implementationPath === ''
        ? {}
        : {
            compilerMetadata: {
              implementationPath: component.implementationPath
            }
          })
    })),
    tokenSummaries: relevantContext.tokens.map((token) => ({
      id: token.id,
      summary: token.value,
      keys: Object.keys(token.value),
      compilerMetadata: {
        path: token.path
      }
    })),
    target: workspace.config.defaultTarget
  };
}

async function loadValidatedYamlDirectory<T>(
  rootDir: string,
  relativeDirectory: string,
  schema: z.ZodType<T>
): Promise<T[]> {
  const directoryPath = join(rootDir, relativeDirectory);
  const filePaths = await findYamlFiles(directoryPath);

  return Promise.all(
    filePaths.map(async (filePath) =>
      validateOrThrow(
        schema,
        await readYamlFile<unknown>(filePath),
        filePath
      )
    )
  );
}

async function loadMergedComponentRegistry(
  rootDir: string,
  relativeDirectory: string
): Promise<ComponentRegistry> {
  const registries = await loadValidatedYamlDirectory(
    rootDir,
    relativeDirectory,
    ComponentRegistrySchema
  );

  if (registries.length === 0) {
    throw new Error(
      `No component registry YAML files found in ${join(rootDir, relativeDirectory)}`
    );
  }

  const firstRegistry = registries[0]!;
  const remainingRegistries = registries.slice(1);
  const mergedComponents: Record<string, ComponentRegistryEntry> = {
    ...firstRegistry.components
  };

  for (const registry of remainingRegistries) {
    if (registry.version !== firstRegistry.version) {
      throw new Error(
        `Component registry version mismatch in ${join(rootDir, relativeDirectory)}`
      );
    }

    if (registry.target !== firstRegistry.target) {
      throw new Error(
        `Component registry target mismatch in ${join(rootDir, relativeDirectory)}`
      );
    }

    for (const [componentId, component] of Object.entries(registry.components)) {
      mergedComponents[componentId] = component;
    }
  }

  return {
    version: firstRegistry.version,
    target: firstRegistry.target,
    components: mergedComponents
  };
}

async function loadTokenFiles(
  rootDir: string,
  relativeDirectory: string
): Promise<WorkspaceTokenFile[]> {
  const directoryPath = join(rootDir, relativeDirectory);
  const filePaths = await findYamlFiles(directoryPath);

  return Promise.all(
    filePaths.map(async (filePath) => ({
      id: basename(filePath, extname(filePath)),
      path: filePath,
      value: validateOrThrow(
        TokenFileSchema,
        await readYamlFile<unknown>(filePath),
        filePath
      )
    }))
  );
}

async function findYamlFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedPaths = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return findYamlFiles(absolutePath);
      }

      if (isYamlFile(entry.name)) {
        return [absolutePath];
      }

      return [];
    })
  );

  return nestedPaths.flat().sort((left, right) => left.localeCompare(right));
}

function isYamlFile(path: string): boolean {
  return path.endsWith('.yaml') || path.endsWith('.yml');
}

function isHarvestIntent(intent: string): boolean {
  return HARVEST_INTENT_TERMS.some((term) => intent.includes(term));
}

function isHarvestComponentId(
  value: string
): value is (typeof HARVEST_COMPONENT_IDS)[number] {
  return (HARVEST_COMPONENT_IDS as readonly string[]).includes(value);
}

function matchesAnyIdentifier(
  id: string,
  secondaryValue: string,
  candidates: readonly string[]
): boolean {
  const normalizedId = normalizeLookup(id);
  const normalizedSecondaryValue = normalizeLookup(secondaryValue);

  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeLookup(candidate);

    return (
      normalizedId === normalizedCandidate ||
      normalizedSecondaryValue === normalizedCandidate
    );
  });
}

function normalizeLookup(value: string): string {
  return value.trim().toLocaleLowerCase();
}
