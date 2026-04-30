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
  it('creates an empty graph', () => {
    const graph = createEmptyGraph('TestProject');
    expect(graph.version).toBe('1.0.0');
    expect(graph.projectName).toBe('TestProject');
    expect(graph.head).toBeNull();
    expect(Object.keys(graph.nodes).length).toBe(0);
  });

  it('adds a root prompt', () => {
    let graph = createEmptyGraph('TestProject');
    graph = addRootPrompt(graph, 'Initial prompt');

    expect(graph.head).not.toBeNull();
    const rootNodeId = graph.head as string;
    const rootNode = getNode(graph, rootNodeId);

    expect(rootNode).toBeDefined();
    expect(rootNode?.promptText).toBe('Initial prompt');
    expect(rootNode?.parentId).toBeNull();
    expect(rootNode?.hierarchyLevel).toBe('project');
  });

  it('fails to add a root prompt if one already exists', () => {
    let graph = createEmptyGraph('TestProject');
    graph = addRootPrompt(graph, 'Initial prompt');
    expect(() => addRootPrompt(graph, 'Another root')).toThrow('Graph already has a root prompt.');
  });

  it('branches a prompt', () => {
    let graph = createEmptyGraph('TestProject');
    graph = addRootPrompt(graph, 'Initial prompt');
    const rootNodeId = graph.head as string;

    graph = branchPrompt(graph, rootNodeId, 'Branch prompt', 'domain');
    expect(graph.head).not.toBe(rootNodeId);

    const branchNodeId = graph.head as string;
    const branchNode = getNode(graph, branchNodeId);

    expect(branchNode).toBeDefined();
    expect(branchNode?.promptText).toBe('Branch prompt');
    expect(branchNode?.parentId).toBe(rootNodeId);
    expect(branchNode?.hierarchyLevel).toBe('domain');
  });

  it('gets ancestors correctly', () => {
    let graph = createEmptyGraph('TestProject');
    graph = addRootPrompt(graph, 'Initial prompt');
    const rootId = graph.head as string;

    graph = branchPrompt(graph, rootId, 'Domain branch', 'domain');
    const domainId = graph.head as string;

    graph = branchPrompt(graph, domainId, 'Task branch', 'task');
    const taskId = graph.head as string;

    const ancestors = getAncestors(graph, taskId);
    expect(ancestors.length).toBe(3);
    expect(ancestors[0]?.id).toBe(rootId);
    expect(ancestors[1]?.id).toBe(domainId);
    expect(ancestors[2]?.id).toBe(taskId);
  });

  it('updates node artifacts and calculates status', () => {
    let graph = createEmptyGraph('TestProject');
    graph = addRootPrompt(graph, 'Initial prompt');
    const rootId = graph.head as string;

    // clean update
    graph = updateNodeArtifacts(graph, rootId, { oslRef: 'osl-123' }, []);
    let node = getNode(graph, rootId);
    expect(node?.artifacts.oslRef).toBe('osl-123');
    expect(node?.status).toBe('clean');

    // warning update
    graph = updateNodeArtifacts(graph, rootId, {}, [{ severity: 'warning', code: 'w1', message: 'warn', path: [] }]);
    node = getNode(graph, rootId);
    expect(node?.status).toBe('warning');

    // error update
    graph = updateNodeArtifacts(graph, rootId, {}, [{ severity: 'error', code: 'e1', message: 'err', path: [] }]);
    node = getNode(graph, rootId);
    expect(node?.status).toBe('broken');
  });

  it('serializes and parses graph successfully', () => {
    let graph = createEmptyGraph('TestProject');
    graph = addRootPrompt(graph, 'Initial prompt');

    const json = serializeGraph(graph);
    const parsed = parseGraph(json);

    expect(parsed).toEqual(graph);
  });
});
