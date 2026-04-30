import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { stringify } from 'yaml';

import {
  buildPromptPacket,
  loadWorkspace
} from './contextResolver.js';
import type { LLMProvider } from '../llm/ollamaProvider.js';
import { OSLViewSchema, RenderASTSchema, type OSLView, type RenderAST } from '../schemas/index.js';
import { writeYamlFile } from '../utils/fs.js';
import { validateOrThrow } from '../utils/validation.js';

const IDE_INTENT_TERMS = ['compile', 'build', 'workspace', 'view', 'ide', 'node', 'graph'];
const DEFAULT_IDE_VIEW_ID = 'IdeMainView';
const DEFAULT_GENERIC_VIEW_ID = 'GeneratedView';
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
  ast: RenderAST;
  outputPath: string;
  astOutputPath: string;
  pipeline: string[];
  yaml: string;
  astYaml: string;
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

  const plannerModel = options.model ?? workspace.config.llm.pipeline.planner.model;

  const generatedAst = await options.provider.structuredGenerate({
    schema: RenderASTSchema,
    system:
      'You are the Ontology UX Planner. Convert the provided OSL View into a Render AST. Map the interface strictly to the available semantic components. Do not invent components.',
    prompt: JSON.stringify({
      osl: validatedOsl,
      components: promptPacket.componentSummaries
    }, null, 2),
    model: plannerModel,
    root: options.root
  });

  const validatedAst = validateOrThrow(
    RenderASTSchema,
    generatedAst,
    'UX Planner AST'
  );

  validatedAst.viewId = validatedOsl.id;

  const astOutputPath = join(
    options.root,
    workspace.config.paths.viewsDir,
    `${validatedOsl.id}.ast.yaml`
  );
  const astYaml = stringify(validatedAst);

  if (options.dryRun !== true) {
    await mkdir(join(options.root, workspace.config.paths.viewsDir), {
      recursive: true
    });
    await writeYamlFile(outputPath, validatedOsl);
    await writeYamlFile(astOutputPath, validatedAst);
  }

  return {
    osl: validatedOsl,
    ast: validatedAst,
    outputPath,
    astOutputPath,
    pipeline: [
      '[✓] Context resolved',
      '[✓] Semantic Parser: OSL generated',
      '[✓] Validator: OSL valid',
      '[✓] UX Planner: AST generated',
      '[→] Next: onto build <view>'
    ],
    yaml,
    astYaml
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
    `If the intent is IDE-related and no clean view id is obvious, use "${DEFAULT_IDE_VIEW_ID}" as the view id.`
  ].join('\n\n');
}

function normalizePlannedOsl(
  osl: OSLView,
  naturalLanguageIntent: string
): OSLView {
  if (!CLEAN_VIEW_ID_PATTERN.test(osl.id)) {
    return {
      ...osl,
      id: isIdeIntent(naturalLanguageIntent)
        ? DEFAULT_IDE_VIEW_ID
        : DEFAULT_GENERIC_VIEW_ID
    };
  }

  return osl;
}

function isIdeIntent(intent: string): boolean {
  const normalizedIntent = intent.toLocaleLowerCase();

  return IDE_INTENT_TERMS.some((term) =>
    normalizedIntent.includes(term)
  );
}
