import type {
  Canon,
  ComponentRegistry,
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
import { validateOrThrow } from '../utils/validation.js';

export const ONTOLOGY_DIRECTORY_PATHS = [
  'ontology/canon',
  'ontology/domain',
  'ontology/tasks',
  'ontology/views',
  'ontology/components',
  'ontology/tokens',
  'ontology/migrations',
  'ontology/evals'
] as const;

export const GENERATED_DIRECTORY_PATHS = [
  'src/generated/views',
  'src/generated/machines',
  'src/generated/schemas',
  'src/generated/hooks'
] as const;

export const CACHE_DIRECTORY_PATHS = ['.ontology/cache'] as const;

export const SEED_COMPONENT_DIRECTORY_PATHS = [
  'src/components/ontology',
  'src/components/ide'
] as const;

export const INIT_DIRECTORY_PATHS = [
  ...ONTOLOGY_DIRECTORY_PATHS,
  ...GENERATED_DIRECTORY_PATHS,
  ...CACHE_DIRECTORY_PATHS,
  ...SEED_COMPONENT_DIRECTORY_PATHS
] as const;

export const SEED_FILE_PATHS = [
  'ontology/ontology.config.yaml',
  'ontology/canon/ide-rules.yaml',
  'ontology/domain/workspace.yaml',
  'ontology/domain/pipeline.yaml',
  'ontology/tasks/compile_view.yaml',
  'ontology/tasks/navigate_graph.yaml',
  'ontology/components/registry.yaml',
  'ontology/tokens/default_tokens.yaml'
] as const;

export const INIT_NEXT_STEPS = [
  'onto plan "Design the main canvas of Ontology Studio..."',
  'onto build IdeMainView',
  'onto why IdeMainView TopologicalMinimap'
] as const;

export interface SeedFileDefinition {
  path: (typeof SEED_FILE_PATHS)[number];
  value: unknown;
}

export function createSeedFiles(projectName: string): SeedFileDefinition[] {
  return [
    {
      path: 'ontology/ontology.config.yaml',
      value: createOntologyConfigSeed(projectName)
    },
    {
      path: 'ontology/canon/ide-rules.yaml',
      value: createIdeCanonSeed()
    },
    {
      path: 'ontology/domain/workspace.yaml',
      value: createWorkspaceDomainSeed()
    },
    {
      path: 'ontology/domain/pipeline.yaml',
      value: createPipelineDomainSeed()
    },
    {
      path: 'ontology/tasks/compile_view.yaml',
      value: createCompileViewTaskSeed()
    },
    {
      path: 'ontology/tasks/navigate_graph.yaml',
      value: createNavigateGraphTaskSeed()
    },
    {
      path: 'ontology/components/registry.yaml',
      value: createComponentRegistrySeed()
    },
    {
      path: 'ontology/tokens/default_tokens.yaml',
      value: createDefaultTokensSeed()
    }
  ];
}

function createOntologyConfigSeed(projectName: string): OntologyConfig {
  return validateOrThrow(
    OntologyConfigSchema,
    {
      version: '1.0.0',
      projectName,
      packageManager: 'npm',
      defaultTarget: 'react-web',
      llm: {
        provider: 'ollama',
        baseUrl: 'http://localhost:11434',
        keepAlive: '5m',
        pipeline: {
          parser: { model: 'qwen2.5-coder:3b', temperature: 0 },
          planner: { model: 'qwen2.5-coder:3b', temperature: 0 },
          critic: { model: 'deepseek-r1:8b', temperature: 0.3 },
          absorber: { model: 'qwen2.5-coder:7b', temperature: 0 }
        }
      },
      paths: {
        ontologyRoot: 'ontology',
        canonDir: 'ontology/canon',
        domainDir: 'ontology/domain',
        tasksDir: 'ontology/tasks',
        viewsDir: 'ontology/views',
        componentsDir: 'ontology/components',
        tokensDir: 'ontology/tokens',
        migrationsDir: 'ontology/migrations',
        evalsDir: 'ontology/evals',
        generatedRoot: 'src/generated',
        generatedViewsDir: 'src/generated/views',
        generatedMachinesDir: 'src/generated/machines',
        generatedSchemasDir: 'src/generated/schemas',
        generatedHooksDir: 'src/generated/hooks',
        cacheDir: '.ontology/cache'
      }
    },
    'Ontology config seed'
  );
}

function createIdeCanonSeed(): Canon {
  return validateOrThrow(
    CanonSchema,
    {
      id: 'ide_rules',
      version: '1.0.0',
      rules: [
        {
          id: 'high_information_density',
          description: 'Information density is critical. Do not waste whitespace.',
          severity: 'blocking',
          appliesTo: ['views', 'layout']
        },
        {
          id: 'always_show_compilation_state',
          description: 'Always provide visual feedback for compilation states (Parsing, Planning, Building).',
          severity: 'blocking',
          appliesTo: ['interaction', 'validation']
        },
        {
          id: 'keyboard_first_interfaces',
          description: 'Interfaces must be keyboard-first. Read-only code should be distinct from editable semantic prompts.',
          severity: 'blocking',
          appliesTo: ['components', 'tokens']
        },
        {
          id: 'generated_code_is_not_source_of_truth',
          description: 'Generated code is compiled residue and must never replace ontology source artifacts as the system of record.',
          severity: 'blocking',
          appliesTo: ['src/generated', 'compiler']
        }
      ]
    },
    'ide canon seed'
  );
}

function createWorkspaceDomainSeed(): DomainEntity {
  return validateOrThrow(
    DomainEntitySchema,
    {
      id: 'workspace',
      version: '1.0.0',
      name: 'Workspace',
      fields: [
        {
          name: 'activeView',
          type: 'string',
          required: false,
          description: 'The currently active view in the IDE'
        },
        {
          name: 'pendingChanges',
          type: 'number',
          required: true,
          description: 'Number of pending changes in the workspace'
        }
      ],
      relations: [],
      constraints: [],
      requiredFields: ['pendingChanges']
    },
    'Workspace seed'
  );
}

function createPipelineDomainSeed(): DomainEntity {
  return validateOrThrow(
    DomainEntitySchema,
    {
      id: 'pipeline',
      version: '1.0.0',
      name: 'Pipeline',
      fields: [
        {
          name: 'intent',
          type: 'string',
          required: true,
          description: 'The semantic intent'
        },
        {
          name: 'contextLinks',
          type: 'string', // Adjust type if needed to be array
          required: true,
          description: 'Links to relevant context'
        },
        {
          name: 'status',
          type: 'string',
          required: true,
          description: 'Status of the compile result'
        },
        {
          name: 'errorLog',
          type: 'string',
          required: false,
          description: 'Error log from compilation'
        },
        {
          name: 'generatedTsx',
          type: 'string',
          required: false,
          description: 'Generated TSX code'
        }
      ],
      relations: [],
      constraints: [],
      requiredFields: ['intent', 'contextLinks', 'status']
    },
    'Pipeline seed'
  );
}

function createCompileViewTaskSeed(): Task {
  return validateOrThrow(
    TaskSchema,
    {
      id: 'trigger_compilation',
      version: '1.0.0',
      actor: 'developer',
      goal: 'compile_view',
      successConditions: ['compilation_successful', 'tsx_generated'],
      relatedEntities: ['Pipeline', 'Workspace']
    },
    'compile view task seed'
  );
}

function createNavigateGraphTaskSeed(): Task {
  return validateOrThrow(
    TaskSchema,
    {
      id: 'shift_abstraction_level',
      version: '1.0.0',
      actor: 'developer',
      goal: 'navigate_graph',
      successConditions: ['graph_rendered', 'node_focused'],
      relatedEntities: ['Pipeline']
    },
    'navigate graph task seed'
  );
}

function createComponentRegistrySeed(): ComponentRegistry {
  return validateOrThrow(
    ComponentRegistrySchema,
    {
      version: '1.0.0',
      target: 'react-web',
      components: {
        Screen: {
          id: 'Screen',
          semanticType: 'screen-container',
          purpose: 'Provide the semantic frame for the IDE.',
          implementationPath: 'src/components/ontology/Screen.tsx',
          propsSchema: { title: 'string', className: 'string' },
          eventsSchema: {},
          constraints: [],
          supportedTargets: ['react-web']
        },
        CodeViewer: {
          id: 'CodeViewer',
          semanticType: 'code-viewer',
          purpose: 'Displays syntax highlighted code.',
          implementationPath: 'src/components/ide/CodeViewer.tsx',
          propsSchema: { code: 'string', language: 'string' },
          eventsSchema: {},
          constraints: [],
          supportedTargets: ['react-web']
        },
        TerminalPanel: {
          id: 'TerminalPanel',
          semanticType: 'terminal',
          purpose: 'Shows CLI output.',
          implementationPath: 'src/components/ide/TerminalPanel.tsx',
          propsSchema: { output: 'string' },
          eventsSchema: {},
          constraints: [],
          supportedTargets: ['react-web']
        },
        GraphVisualizer: {
          id: 'GraphVisualizer',
          semanticType: 'graph',
          purpose: 'Shows node connections.',
          implementationPath: 'src/components/ide/GraphVisualizer.tsx',
          propsSchema: { nodes: 'array', edges: 'array' },
          eventsSchema: {},
          constraints: [],
          supportedTargets: ['react-web']
        },
        StatusBadge: {
          id: 'StatusBadge',
          semanticType: 'badge',
          purpose: 'Shows compilation status.',
          implementationPath: 'src/components/ide/StatusBadge.tsx',
          propsSchema: { status: 'string' },
          eventsSchema: {},
          constraints: [],
          supportedTargets: ['react-web']
        },
        SplitPane: {
          id: 'SplitPane',
          semanticType: 'layout',
          purpose: 'Layout component.',
          implementationPath: 'src/components/ide/SplitPane.tsx',
          propsSchema: { orientation: 'string' },
          eventsSchema: {},
          constraints: [],
          supportedTargets: ['react-web']
        },
        TopologicalMinimap: {
          id: 'TopologicalMinimap',
          semanticType: 'minimap',
          purpose: 'Minimap for topological view.',
          implementationPath: 'src/components/ide/TopologicalMinimap.tsx',
          propsSchema: {},
          eventsSchema: {},
          constraints: [],
          supportedTargets: ['react-web']
        },
        NodeCard: {
          id: 'NodeCard',
          semanticType: 'card',
          purpose: 'Card representing a semantic node.',
          implementationPath: 'src/components/ide/NodeCard.tsx',
          propsSchema: {},
          eventsSchema: {},
          constraints: [],
          supportedTargets: ['react-web']
        }
      }
    },
    'component registry seed'
  );
}

function createDefaultTokensSeed(): Record<string, unknown> {
  return {
    version: '1.0.0',
    density: {
      compact: 4,
      comfortable: 8,
      spacious: 12
    },
    contrast: {
      minimumText: 4.5,
      minimumInteractive: 3,
      criticalSurface: 7
    },
    tapTargets: {
      minimumOperator: 48,
      minimumCriticalAction: 56
    },
    semanticColors: {
      primaryAction: '#0B5FFF',
      success: '#027A48',
      warning: '#C87A00',
      danger: '#B42318',
      offline: '#475467',
      surface: '#FFFFFF',
      text: '#101828'
    }
  };
}


export type TextSeedFileDefinition = {
  path: string;
  content: string;
};

export function createTextSeedFiles(): TextSeedFileDefinition[] {
  return [
    {
      path: 'src/components/ontology/Screen.tsx',
      content: `import type { ReactNode } from 'react';
import { useId } from 'react';

import { classNames } from './classNames.js';

export interface ScreenProps {
  title?: string;
  mode?: 'operator' | 'manager' | 'auditor' | 'developer';
  className?: string;
  children: ReactNode;
}

export function Screen({
  title,
  mode = 'operator',
  className,
  children
}: ScreenProps): React.JSX.Element {
  const titleId = useId();
  const hasHeader = title !== undefined || mode !== undefined;

  return (
    <main
      aria-labelledby={title === undefined ? undefined : titleId}
      className={classNames('ontology-screen', \`ontology-screen--\${mode}\`, className)}
      data-mode={mode}
    >
      {hasHeader ? (
        <header className="ontology-screen__header">
          {title === undefined ? null : (
            <h1 id={titleId} className="ontology-screen__title">
              {title}
            </h1>
          )}
          <p className="ontology-screen__mode" aria-label={\`Mode: \${mode}\`}>
            {mode}
          </p>
        </header>
      ) : null}
      <div className="ontology-screen__body">{children}</div>
    </main>
  );
}
`
    },
    {
      path: 'src/components/ontology/classNames.ts',
      content: `export function classNames(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}
`
    },
    {
      path: 'src/components/ide/CodeViewer.tsx',
      content: `export interface CodeViewerProps {
  code?: string;
  language?: string;
  className?: string;
}

export function CodeViewer({ code, language, className }: CodeViewerProps): React.JSX.Element {
  return (
    <div className={className}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
`
    },
    {
      path: 'src/components/ide/TerminalPanel.tsx',
      content: `export interface TerminalPanelProps {
  output?: string;
  className?: string;
}

export function TerminalPanel({ output, className }: TerminalPanelProps): React.JSX.Element {
  return (
    <div className={className}>
      <pre>{output}</pre>
    </div>
  );
}
`
    },
    {
      path: 'src/components/ide/GraphVisualizer.tsx',
      content: `export interface GraphVisualizerProps {
  nodes?: unknown[];
  edges?: unknown[];
  className?: string;
}

export function GraphVisualizer({ nodes, edges, className }: GraphVisualizerProps): React.JSX.Element {
  return (
    <div className={className}>
      <p>GraphVisualizer</p>
    </div>
  );
}
`
    },
    {
      path: 'src/components/ide/StatusBadge.tsx',
      content: `export interface StatusBadgeProps {
  status?: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps): React.JSX.Element {
  return (
    <div className={className}>
      <span>{status}</span>
    </div>
  );
}
`
    },
    {
      path: 'src/components/ide/SplitPane.tsx',
      content: `import type { ReactNode } from 'react';

export interface SplitPaneProps {
  orientation?: 'horizontal' | 'vertical' | string;
  className?: string;
  children?: ReactNode;
}

export function SplitPane({ orientation, className, children }: SplitPaneProps): React.JSX.Element {
  return (
    <div className={className} data-orientation={orientation}>
      {children}
    </div>
  );
}
`
    },
    {
      path: 'src/components/ide/TopologicalMinimap.tsx',
      content: `export interface TopologicalMinimapProps {
  className?: string;
}

export function TopologicalMinimap({ className }: TopologicalMinimapProps): React.JSX.Element {
  return (
    <div className={className}>
      <p>TopologicalMinimap</p>
    </div>
  );
}
`
    },
    {
      path: 'src/components/ide/NodeCard.tsx',
      content: `import type { ReactNode } from 'react';

export interface NodeCardProps {
  title?: string;
  description?: string;
  className?: string;
  children?: ReactNode;
}

export function NodeCard({ title, description, className, children }: NodeCardProps): React.JSX.Element {
  return (
    <div className={className}>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
`
    },
  ];
}
