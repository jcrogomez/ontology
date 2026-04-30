import { describe, it, expect } from 'vitest';
import {
  createEmptyGraph,
  addRootPrompt,
  branchPrompt,
  getNode,
  getAncestors,
  checkout,
  updateNodeArtifacts,
  serializeGraph,
  parseGraph
} from '../src/core/promptGraph.js';

describe('promptGraph', () => {
  it('1. createEmptyGraph creates empty graph with version, projectName, nodes {}, head null', () => {
    const graph = createEmptyGraph('ontology-studio');
    expect(graph.version).toBe('1.0.0');
    expect(graph.projectName).toBe('ontology-studio');
    expect(graph.nodes).toEqual({});
    expect(graph.head).toBeNull();
  });

  it('2. addRootPrompt creates root project', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'Build Ontology Studio itself.');

    expect(graph.head).not.toBeNull();
    const rootNodeId = graph.head!;
    const rootNode = getNode(graph, rootNodeId);

    expect(rootNode).toBeDefined();
    expect(rootNode?.parentId).toBeNull();
    expect(rootNode?.hierarchyLevel).toBe('project');
    expect(rootNode?.promptText).toBe('Build Ontology Studio itself.');
    expect(rootNode?.status).toBe('clean');
    expect(rootNode?.author).toBe('developer');
    expect(Object.keys(graph.nodes).length).toBe(1);
  });

  it('3. addRootPrompt fails if already has root', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'First root.');
    expect(() => addRootPrompt(graph, 'Second root.')).toThrow('Graph already has a root prompt.');
  });

  it('4. branchPrompt creates child and moves head', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'Build Ontology Studio itself.');
    const rootId = graph.head!;

    graph = branchPrompt(graph, rootId, 'Add a domain entity.', 'domain');
    const childId = graph.head!;

    expect(childId).not.toBe(rootId);
    expect(Object.keys(graph.nodes).length).toBe(2);

    const childNode = getNode(graph, childId);
    expect(childNode).toBeDefined();
    expect(childNode?.parentId).toBe(rootId);
    expect(childNode?.hierarchyLevel).toBe('domain');
  });

  it('5. branchPrompt fails if parent does not exist', () => {
    let graph = createEmptyGraph('ontology-studio');
    expect(() => branchPrompt(graph, 'non-existent-id', 'test', 'domain')).toThrow('Parent node non-existent-id does not exist in graph.');
  });

  it('6. getAncestors returns root -> child -> grandchild', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'root');
    const rootId = graph.head!;

    graph = branchPrompt(graph, rootId, 'child', 'domain');
    const childId = graph.head!;

    graph = branchPrompt(graph, childId, 'grandchild', 'view');
    const grandchildId = graph.head!;

    const lineage = getAncestors(graph, grandchildId);
    expect(lineage.length).toBe(3);
    expect(lineage[0]?.id).toBe(rootId);
    expect(lineage[1]?.id).toBe(childId);
    expect(lineage[2]?.id).toBe(grandchildId);
  });

  it('7. checkout moves head', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'root');
    const rootId = graph.head!;

    graph = branchPrompt(graph, rootId, 'child1', 'domain');
    const child1Id = graph.head!;

    graph = checkout(graph, rootId);
    expect(graph.head).toBe(rootId);

    graph = branchPrompt(graph, rootId, 'child2', 'domain');
    const child2Id = graph.head!;

    expect(graph.head).toBe(child2Id);
    expect(Object.keys(graph.nodes).length).toBe(3);
  });

  it('8. checkout fails if node does not exist', () => {
    const graph = createEmptyGraph('ontology-studio');
    expect(() => checkout(graph, 'missing')).toThrow('Node missing does not exist in graph.');
  });

  it('9. updateNodeArtifacts merges refs', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'root');
    const rootId = graph.head!;

    graph = updateNodeArtifacts(graph, rootId, { oslRef: 'test.osl.yaml' });
    let node = getNode(graph, rootId);
    expect(node?.artifacts.oslRef).toBe('test.osl.yaml');
    expect(node?.artifacts.astRef).toBeUndefined();

    graph = updateNodeArtifacts(graph, rootId, { astRef: 'test.ast.yaml' });
    node = getNode(graph, rootId);
    expect(node?.artifacts.oslRef).toBe('test.osl.yaml');
    expect(node?.artifacts.astRef).toBe('test.ast.yaml');
  });

  it('10. updateNodeArtifacts puts clean without diagnostics', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'root');
    const rootId = graph.head!;

    graph = updateNodeArtifacts(graph, rootId, {}, []);
    const node = getNode(graph, rootId);
    expect(node?.status).toBe('clean');
  });

  it('11. updateNodeArtifacts puts warning with warning', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'root');
    const rootId = graph.head!;

    graph = updateNodeArtifacts(graph, rootId, {}, [
      { severity: 'warning', code: 'WARN', message: 'test warning', path: [] }
    ]);
    const node = getNode(graph, rootId);
    expect(node?.status).toBe('warning');
  });

  it('12. updateNodeArtifacts puts broken with error', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'root');
    const rootId = graph.head!;

    graph = updateNodeArtifacts(graph, rootId, {}, [
      { severity: 'warning', code: 'WARN', message: 'test warning', path: [] },
      { severity: 'error', code: 'ERR', message: 'test error', path: [] }
    ]);
    const node = getNode(graph, rootId);
    expect(node?.status).toBe('broken');
  });

  it('13. updateNodeArtifacts puts broken with blocking', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'root');
    const rootId = graph.head!;

    graph = updateNodeArtifacts(graph, rootId, {}, [
      { severity: 'blocking', code: 'BLOCK', message: 'test blocking', path: [] }
    ]);
    const node = getNode(graph, rootId);
    expect(node?.status).toBe('broken');
  });

  it('14. serializeGraph returns parseable JSON', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'root');
    const rootId = graph.head!;

    graph = branchPrompt(graph, rootId, 'child', 'domain');
    graph = updateNodeArtifacts(graph, graph.head!, { oslRef: 'test.osl.yaml' });

    const json = serializeGraph(graph);
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.head).toBe(graph.head);
    expect(Object.keys(parsed.nodes).length).toBe(2);
  });

  it('15. parseGraph validates and restores graph', () => {
    let graph = createEmptyGraph('ontology-studio');
    graph = addRootPrompt(graph, 'root');
    const rootId = graph.head!;

    graph = branchPrompt(graph, rootId, 'child', 'domain');
    graph = updateNodeArtifacts(graph, graph.head!, { oslRef: 'test.osl.yaml' }, [
      { severity: 'warning', code: 'W1', message: 'W1', path: [] }
    ]);

    const json = serializeGraph(graph);
    const restored = parseGraph(json);

    expect(restored).toEqual(graph);
    expect(restored.nodes[graph.head!]?.status).toBe('warning');
  });
});
