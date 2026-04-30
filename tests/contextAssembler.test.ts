import { describe, it, expect, vi } from 'vitest';
import { assembleContextForNode } from '../src/core/contextAssembler.js';
import { PromptGraph } from '../src/core/promptGraph.js';

describe('contextAssembler', () => {
  it('aisla el contexto correctamente para una rama, ignorando ramas paralelas', async () => {
    const graph = new PromptGraph();

    // Raíz
    const root = graph.addRoot('Raiz');
    const rootId = root.id;

    // Rama 1
    const b1 = graph.branch(rootId, 'Dominio 1', 'domain');
    const b1Id = b1.id;
    graph.updateArtifacts(b1Id, { oslRef: 'b1.osl.yaml' });

    const b1Child = graph.branch(b1Id, 'Canon 1', 'canon');
    const b1ChildId = b1Child.id;
    graph.updateArtifacts(b1ChildId, { oslRef: 'c1.osl.yaml' });

    // Rama 2 paralela
    const b2 = graph.branch(rootId, 'Dominio 2', 'domain');
    const b2Id = b2.id;
    graph.updateArtifacts(b2Id, { oslRef: 'b2.osl.yaml' });

    // Artefactos en memoria para el loader
    const artifactsStore: Record<string, any> = {
      'b1.osl.yaml': { id: 'domain1' },
      'c1.osl.yaml': { id: 'canon1' },
      'b2.osl.yaml': { id: 'domain2' },
    };

    const mockLoader = vi.fn(async (ref: string) => {
      if (!artifactsStore[ref]) throw new Error('Not found');
      return artifactsStore[ref];
    });

    // Ensamblamos para la rama 1
    const ctx1 = await assembleContextForNode(graph, b1ChildId, mockLoader);

    expect(ctx1.lineagePrompts).toEqual(['Raiz', 'Dominio 1', 'Canon 1']);
    expect(ctx1.domainEntities).toEqual([{ id: 'domain1' }]);
    expect(ctx1.canonRules).toEqual([{ id: 'canon1' }]);

    // Ensamblamos para la rama 2
    const ctx2 = await assembleContextForNode(graph, b2Id, mockLoader);

    expect(ctx2.lineagePrompts).toEqual(['Raiz', 'Dominio 2']);
    expect(ctx2.domainEntities).toEqual([{ id: 'domain2' }]);
    expect(ctx2.canonRules).toEqual([]);
  });
});
