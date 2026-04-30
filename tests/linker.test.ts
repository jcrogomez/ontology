import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initOntologyProject } from '../src/core/init.js';
import { loadWorkspace } from '../src/core/contextResolver.js';
import { SymbolTable } from '../src/core/symbolTable.js';
import { SemanticLinker } from '../src/core/linker.js';
import type { OSLView, RenderAST } from '../src/schemas/index.js';

describe('Semantic Linker', () => {
  let projectRoot: string;
  let linker: SemanticLinker;

  beforeEach(async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ontology-linker-test-'));
    const result = await initOntologyProject({ cwd: tempDir, projectName: 'test-project' });
    projectRoot = result.projectRoot;

    const workspace = await loadWorkspace(projectRoot);
    const symbolTable = SymbolTable.fromWorkspace(workspace);
    linker = new SemanticLinker(symbolTable);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('validates OSLView successfully when all references exist', () => {
    const view: OSLView = {
      id: 'ConfirmHarvestView',
      version: '1.0.0',
      task: 'confirm_harvest_batch',
      actor: 'operator',
      context: {},
      domainEntities: ['HarvestBatch', 'InventoryLot'],
      information: {},
      interaction: {},
      components: [
        { id: 'Screen', semanticType: 'screen-container' }
      ],
      layout: {},
      visual: {},
      data: {},
      target: 'react-web'
    };

    const diagnostics = linker.linkView(view);
    expect(diagnostics).toHaveLength(0);
  });

  it('reports missing entities in OSLView', () => {
    const view: OSLView = {
      id: 'MissingEntityView',
      version: '1.0.0',
      task: 'confirm_harvest_batch',
      actor: 'operator',
      context: {},
      domainEntities: ['MissingEntity'],
      information: {},
      interaction: {},
      components: [],
      layout: {},
      visual: {},
      data: {},
      target: 'react-web'
    };

    const diagnostics = linker.linkView(view);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'LINK_MISSING_ENTITY',
      path: ['domainEntities', '0']
    });
  });

  it('validates RenderAST successfully when all references exist', () => {
    const ast: RenderAST = {
      id: 'ast1',
      viewId: 'ConfirmHarvestView',
      version: '1.0.0',
      entityRefs: ['HarvestBatch'],
      taskRef: 'confirm_harvest_batch',
      layout: {},
      nodes: [
        {
          id: 'node1',
          component: 'Screen',
          props: {},
          children: [
            {
              id: 'node2',
              component: 'HeaderSummary',
              props: {}
            }
          ]
        }
      ],
      dataBindings: [
        {
          id: 'bind1',
          source: 'HarvestBatch.actual_weight',
          target: 'someTarget'
        }
      ],
      target: 'react-web'
    };

    const diagnostics = linker.linkRenderAST(ast);
    expect(diagnostics).toHaveLength(0);
  });

  it('reports missing field in RenderAST data bindings', () => {
    const ast: RenderAST = {
      id: 'ast2',
      viewId: 'ConfirmHarvestView',
      version: '1.0.0',
      entityRefs: ['HarvestBatch'],
      taskRef: 'confirm_harvest_batch',
      layout: {},
      nodes: [],
      dataBindings: [
        {
          id: 'bind1',
          source: 'HarvestBatch.non_existent_field',
          target: 'someTarget'
        }
      ],
      target: 'react-web'
    };

    const diagnostics = linker.linkRenderAST(ast);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'LINK_MISSING_FIELD',
      path: ['dataBindings', '0', 'source']
    });
  });
});
