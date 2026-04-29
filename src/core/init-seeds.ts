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

export const INIT_DIRECTORY_PATHS = [
  ...ONTOLOGY_DIRECTORY_PATHS,
  ...GENERATED_DIRECTORY_PATHS,
  ...CACHE_DIRECTORY_PATHS
] as const;

export const SEED_FILE_PATHS = [
  'ontology/ontology.config.yaml',
  'ontology/canon/ops_canon.yaml',
  'ontology/domain/harvest_batch.yaml',
  'ontology/domain/inventory_lot.yaml',
  'ontology/tasks/confirm_harvest_batch.yaml',
  'ontology/components/registry.yaml',
  'ontology/tokens/default_tokens.yaml'
] as const;

export const INIT_NEXT_STEPS = [
  'onto plan "..."',
  'onto build HarvestConfirmation',
  'onto inspect HarvestConfirmation'
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
      path: 'ontology/canon/ops_canon.yaml',
      value: createOpsCanonSeed()
    },
    {
      path: 'ontology/domain/harvest_batch.yaml',
      value: createHarvestBatchSeed()
    },
    {
      path: 'ontology/domain/inventory_lot.yaml',
      value: createInventoryLotSeed()
    },
    {
      path: 'ontology/tasks/confirm_harvest_batch.yaml',
      value: createConfirmHarvestBatchTaskSeed()
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

function createOpsCanonSeed(): Canon {
  return validateOrThrow(
    CanonSchema,
    {
      id: 'ops_canon',
      version: '1.0.0',
      rules: [
        {
          id: 'primary_action_always_visible',
          description:
            'Primary completion actions must remain visible during the critical task path.',
          severity: 'blocking',
          appliesTo: ['views', 'layout']
        },
        {
          id: 'errors_must_be_reversible',
          description:
            'Operators must be able to understand and reverse recoverable errors without losing work.',
          severity: 'blocking',
          appliesTo: ['interaction', 'validation']
        },
        {
          id: 'operator_mode_requires_large_tap_targets',
          description:
            'Operator-facing controls must preserve large tap targets for use with gloves or fast-paced handling.',
          severity: 'warning',
          appliesTo: ['components', 'tokens']
        },
        {
          id: 'offline_state_must_be_visible',
          description:
            'Any queued or offline operational state must be visible before confirmation is finalized.',
          severity: 'blocking',
          appliesTo: ['views', 'components']
        },
        {
          id: 'generated_code_is_not_source_of_truth',
          description:
            'Generated code is compiled residue and must never replace ontology source artifacts as the system of record.',
          severity: 'blocking',
          appliesTo: ['src/generated', 'compiler']
        }
      ]
    },
    'ops canon seed'
  );
}

function createHarvestBatchSeed(): DomainEntity {
  return validateOrThrow(
    DomainEntitySchema,
    {
      id: 'harvest_batch',
      version: '1.0.0',
      name: 'HarvestBatch',
      fields: [
        {
          name: 'batch_id',
          type: 'string',
          required: true,
          description: 'Unique identifier for the harvest batch'
        },
        {
          name: 'crop_name',
          type: 'string',
          required: true,
          description: 'Human-readable crop name for the batch'
        },
        {
          name: 'expected_weight',
          type: 'number',
          required: true,
          unit: 'g',
          description: 'Expected total harvested weight'
        },
        {
          name: 'actual_weight',
          type: 'number',
          required: true,
          unit: 'g',
          description: 'Observed measured harvested weight'
        },
        {
          name: 'variance',
          type: 'number',
          required: false,
          unit: 'percentage',
          description: 'Difference between expected and actual weight'
        },
        {
          name: 'loss_reason',
          type: 'string',
          required: false,
          description: 'Operator-provided explanation for significant loss'
        },
        {
          name: 'ambient_temperature',
          type: 'number',
          required: false,
          unit: 'celsius',
          description: 'Ambient temperature during measurement'
        },
        {
          name: 'operator_id',
          type: 'string',
          required: true,
          description: 'Identifier for the operator confirming the batch'
        },
        {
          name: 'lot_id',
          type: 'string',
          required: true,
          description: 'Inventory lot to create or associate'
        }
      ],
      relations: [
        {
          name: 'inventory_lot',
          targetEntity: 'InventoryLot',
          kind: 'oneToOne',
          description: 'Confirmed batch materializes into an inventory lot'
        }
      ],
      constraints: [
        {
          id: 'actual_weight_must_be_positive',
          description: 'Actual measured weight must be greater than zero',
          expression: 'actual_weight > 0'
        },
        {
          id: 'variance_requires_reason_when_high',
          description:
            'A significant variance should capture a loss reason before confirmation.',
          expression:
            'variance == null || variance <= 5 || loss_reason != null'
        }
      ],
      requiredFields: [
        'batch_id',
        'crop_name',
        'expected_weight',
        'actual_weight',
        'operator_id',
        'lot_id'
      ]
    },
    'HarvestBatch seed'
  );
}

function createInventoryLotSeed(): DomainEntity {
  return validateOrThrow(
    DomainEntitySchema,
    {
      id: 'inventory_lot',
      version: '1.0.0',
      name: 'InventoryLot',
      fields: [
        {
          name: 'lot_id',
          type: 'string',
          required: true,
          description: 'Unique inventory lot identifier'
        },
        {
          name: 'sku',
          type: 'string',
          required: true,
          description: 'Stock keeping unit associated with the lot'
        },
        {
          name: 'quantity',
          type: 'number',
          required: true,
          description: 'Counted quantity for the lot'
        },
        {
          name: 'unit',
          type: 'string',
          required: true,
          description: 'Unit used to interpret the quantity'
        },
        {
          name: 'created_at',
          type: 'date',
          required: true,
          description: 'Timestamp when the lot was created'
        }
      ],
      relations: [
        {
          name: 'source_batch',
          targetEntity: 'HarvestBatch',
          kind: 'oneToOne',
          description: 'Inventory lot originates from a confirmed harvest batch'
        }
      ],
      constraints: [
        {
          id: 'quantity_must_be_positive',
          description: 'Inventory lot quantity must be greater than zero',
          expression: 'quantity > 0'
        }
      ],
      requiredFields: ['lot_id', 'sku', 'quantity', 'unit', 'created_at']
    },
    'InventoryLot seed'
  );
}

function createConfirmHarvestBatchTaskSeed(): Task {
  return validateOrThrow(
    TaskSchema,
    {
      id: 'confirm_harvest_batch',
      version: '1.0.0',
      actor: 'operator',
      goal: 'confirm_harvest_batch',
      successConditions: [
        'actual_weight_recorded',
        'variance_validated',
        'inventory_lot_created',
        'confirmation_synced_or_queued'
      ],
      relatedEntities: ['HarvestBatch', 'InventoryLot']
    },
    'confirm harvest batch task seed'
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
          purpose:
            'Provide the semantic frame for an operator workflow screen and its major zones.',
          implementationPath: 'src/components/ontology/Screen.tsx',
          propsSchema: {
            title: 'string',
            mode: 'operator | manager | auditor',
            className: 'string'
          },
          eventsSchema: {},
          constraints: [
            'Must preserve a landmark main region for screen-reader navigation.',
            'Must support mode-specific presentation without embedding workflow rules.'
          ],
          supportedTargets: ['react-web']
        },
        HeaderSummary: {
          id: 'HeaderSummary',
          semanticType: 'context-summary',
          purpose:
            'Summarize key operational context for the current confirmation screen.',
          implementationPath: 'src/components/ontology/HeaderSummary.tsx',
          propsSchema: {
            title: 'string',
            fields: 'array',
            syncStatus: 'online | offline | queued | syncing',
            className: 'string'
          },
          eventsSchema: {},
          constraints: [
            'Must present labels and values in an accessible summary structure.',
            'Must allow sync state to be surfaced without deciding synchronization policy.'
          ],
          supportedTargets: ['react-web']
        },
        NumericWeightInput: {
          id: 'NumericWeightInput',
          semanticType: 'numeric-measurement-input',
          purpose:
            'Capture an operator-entered weight value and expose semantic change and commit callbacks.',
          implementationPath: 'src/components/ontology/NumericWeightInput.tsx',
          propsSchema: {
            field: 'string',
            label: 'string',
            unit: 'string',
            size: 'small | medium | large',
            required: 'boolean',
            autofocus: 'boolean',
            disabled: 'boolean',
            value: 'number | null',
            error: 'string | null',
            className: 'string'
          },
          eventsSchema: {
            onValueChange: {
              payload: {
                field: 'string',
                value: 'number | null',
                unit: 'string'
              }
            },
            onValueCommit: {
              payload: {
                field: 'string',
                value: 'number',
                unit: 'string',
                source: 'manual'
              }
            }
          },
          constraints: [
            'Must emit semantic callbacks only and must not infer workflow validity.',
            'Must keep the unit and error state accessible while the user edits the value.'
          ],
          supportedTargets: ['react-web']
        },
        VarianceAlert: {
          id: 'VarianceAlert',
          semanticType: 'variance-explanation-alert',
          purpose:
            'Present variance context and optionally collect an operator reason.',
          implementationPath: 'src/components/ontology/VarianceAlert.tsx',
          propsSchema: {
            variance: 'number | null',
            threshold: 'number',
            requiresReason: 'boolean',
            reason: 'string',
            className: 'string'
          },
          eventsSchema: {
            onReasonChange: {
              payload: {
                reason: 'string'
              }
            },
            onReasonProvided: {
              payload: {
                reason: 'string'
              }
            },
            onDismissRequested: {
              payload: {}
            }
          },
          constraints: [
            'Must not decide whether a reason is sufficient for workflow completion.',
            'Must present variance messaging accessibly without relying on color alone.'
          ],
          supportedTargets: ['react-web']
        },
        StickyPrimaryButton: {
          id: 'StickyPrimaryButton',
          semanticType: 'sticky-primary-action',
          purpose:
            'Keep the primary action reachable while exposing semantic intent callbacks.',
          implementationPath: 'src/components/ontology/StickyPrimaryButton.tsx',
          propsSchema: {
            action: 'string',
            label: 'string',
            loading: 'boolean',
            disabled: 'boolean',
            className: 'string'
          },
          eventsSchema: {
            onIntent: {
              payload: {
                action: 'string'
              }
            },
            onConfirmRequested: {
              payload: {
                action: 'string'
              }
            }
          },
          constraints: [
            'Must remain accessible while loading or disabled.',
            'Must not determine whether an action is allowed or final.'
          ],
          supportedTargets: ['react-web']
        },
        OfflineSyncBadge: {
          id: 'OfflineSyncBadge',
          semanticType: 'sync-state-indicator',
          purpose:
            'Surface online, offline, queued, or syncing status in a compact accessible badge.',
          implementationPath: 'src/components/ontology/OfflineSyncBadge.tsx',
          propsSchema: {
            status: 'online | offline | queued | syncing',
            className: 'string'
          },
          eventsSchema: {},
          constraints: [
            'Must expose state textually for assistive technologies.',
            'Must remain presentation-only and avoid triggering synchronization behavior.'
          ],
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
