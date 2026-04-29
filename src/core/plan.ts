import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { stringify } from 'yaml';

import {
  buildPromptPacket,
  loadWorkspace
} from './contextResolver.js';
import type { LLMProvider } from '../llm/ollamaProvider.js';
import { OSLViewSchema, type OSLView } from '../schemas/index.js';
import { writeYamlFile } from '../utils/fs.js';
import { validateOrThrow } from '../utils/validation.js';

const HARVEST_INTENT_TERMS = ['harvest', 'cosecha', 'merma', 'weight', 'peso'];
const DEFAULT_HARVEST_VIEW_ID = 'HarvestConfirmation';
const CLEAN_VIEW_ID_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

export interface RunSemanticParserOptions {
  naturalLanguageIntent: string;
  provider: LLMProvider;
  root: string;
  dryRun?: boolean;
  model?: string;
}

export interface RunSemanticParserResult {
  osl: OSLView;
  outputPath: string;
  pipeline: string[];
  yaml: string;
}

export async function runSemanticParser(
  options: RunSemanticParserOptions
): Promise<RunSemanticParserResult> {
  const workspace = await loadWorkspace(options.root);
  const promptPacket = buildPromptPacket(
    workspace,
    options.naturalLanguageIntent
  );

  const generatedOsl = await options.provider.structuredGenerate({
    schema: OSLViewSchema,
    system:
      'You convert human interface intent into Ontology Specification Language. Return only valid JSON matching the provided schema. Do not mention React, XState, Tailwind, shadcn, or any implementation library in OSL.',
    prompt: buildSemanticParserPrompt(
      options.naturalLanguageIntent,
      promptPacket
    ),
    ...(options.model === undefined ? {} : { model: options.model }),
    root: options.root
  });

  const normalizedOsl = normalizePlannedOsl(
    generatedOsl,
    options.naturalLanguageIntent
  );
  const validatedOsl = validateOrThrow(
    OSLViewSchema,
    normalizedOsl,
    'Semantic Parser OSL'
  );
  const outputPath = join(
    options.root,
    workspace.config.paths.viewsDir,
    `${validatedOsl.id}.osl.yaml`
  );
  const yaml = stringify(validatedOsl);

  if (options.dryRun !== true) {
    await mkdir(join(options.root, workspace.config.paths.viewsDir), {
      recursive: true
    });
    await writeYamlFile(outputPath, validatedOsl);
  }

  return {
    osl: validatedOsl,
    outputPath,
    pipeline: [
      '[✓] Context resolved',
      '[✓] Semantic Parser: OSL generated',
      '[✓] Validator: OSL valid',
      '[→] Next: onto plan --ast <view> or onto build <view>'
    ],
    yaml
  };
}

function buildSemanticParserPrompt(
  naturalLanguageIntent: string,
  promptPacket: unknown
): string {
  return [
    'Create an Ontology Specification Language (OSL) view description.',
    `Natural language intent:\n${naturalLanguageIntent.trim()}`,
    'Compact context packet:',
    JSON.stringify(promptPacket, null, 2),
    `If the intent is harvest-related and no clean view id is obvious, use "${DEFAULT_HARVEST_VIEW_ID}" as the view id.`
  ].join('\n\n');
}

function normalizePlannedOsl(
  osl: OSLView,
  naturalLanguageIntent: string
): OSLView {
  if (
    isHarvestIntent(naturalLanguageIntent) &&
    !CLEAN_VIEW_ID_PATTERN.test(osl.id)
  ) {
    return {
      ...osl,
      id: DEFAULT_HARVEST_VIEW_ID
    };
  }

  return osl;
}

function isHarvestIntent(intent: string): boolean {
  const normalizedIntent = intent.toLocaleLowerCase();

  return HARVEST_INTENT_TERMS.some((term) =>
    normalizedIntent.includes(term)
  );
}
