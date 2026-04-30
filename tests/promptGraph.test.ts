import { describe, it, expect } from 'vitest';
import { PromptGraph } from '../src/core/promptGraph.js';

describe('PromptGraph - Git de Intenciones', () => {
  it('1. debe inicializar un grafo y crear un nodo raíz project', () => {
    const graph = new PromptGraph();
    const root = graph.addRoot('Establece un entorno para desarrolladores', 'project');

    expect(root.id).toBeDefined();
    expect(root.parentId).toBeNull();
    expect(root.promptText).toBe('Establece un entorno para desarrolladores');
    expect(root.hierarchyLevel).toBe('project');
    expect(root.status).toBe('clean');
    expect(graph.getHead()).toBe(root.id);
  });

  it('2. Crear grafo vacío', () => {
    const graph = new PromptGraph();
    expect(graph.getHead()).toBeNull();
    expect(graph.serialize()).toContain('"nodes": {}');
  });

  it('3. debe permitir bifurcar (branch) a partir de un nodo existente', () => {
    const graph = new PromptGraph();
    const root = graph.addRoot('Entorno inicial', 'project');

    const child = graph.branch(root.id, 'Crea la vista principal del IDE', 'view');

    expect(child.parentId).toBe(root.id);
    expect(child.hierarchyLevel).toBe('view');
    expect(graph.getHead()).toBe(child.id);
  });

  it('4. Rechazar branch si el parent no existe', () => {
    const graph = new PromptGraph();
    expect(() => {
      graph.branch('non-existent-id', 'Test text', 'view');
    }).toThrowError('Parent node non-existent-id does not exist in the graph.');
  });

  it('5. debe recuperar el linaje completo (getAncestors)', () => {
    const graph = new PromptGraph();
    const v1 = graph.addRoot('Reglas del sistema', 'project');
    const v2 = graph.branch(v1.id, 'Entidad de Workspace', 'domain');
    const v3 = graph.branch(v2.id, 'Vista de configuración', 'view');
    const v4 = graph.branch(v3.id, 'Botón de guardado rojo', 'component');

    const lineage = graph.getAncestors(v4.id);

    expect(lineage).toHaveLength(4);
    expect(lineage[0]?.id).toBe(v1.id);
    expect(lineage[3]?.id).toBe(v4.id);
    expect(lineage[3]?.promptText).toBe('Botón de guardado rojo');
  });

  it('6. debe actualizar los artefactos', () => {
    const graph = new PromptGraph();
    const node = graph.addRoot('Crear botón', 'component');

    graph.updateArtifacts(node.id, { astRef: 'v1.ast.yaml' });

    const updatedNode = graph.getNode(node.id)!;
    expect(updatedNode.artifacts.astRef).toBe('v1.ast.yaml');
  });

  it('7. Recalcular status con diagnostics', () => {
    const graph = new PromptGraph();
    const n1 = graph.addRoot('Nodo 1', 'project');

    // sin diagnostics = clean
    graph.updateArtifacts(n1.id, {}, []);
    expect(graph.getNode(n1.id)!.status).toBe('clean');

    // warning = warning
    graph.updateArtifacts(n1.id, {}, [
      { severity: 'warning', code: 'WARN', message: 'test', path: [] }
    ]);
    expect(graph.getNode(n1.id)!.status).toBe('warning');

    // error = broken
    graph.updateArtifacts(n1.id, {}, [
      { severity: 'error', code: 'ERR', message: 'test', path: [] }
    ]);
    expect(graph.getNode(n1.id)!.status).toBe('broken');

    // blocking = broken
    graph.updateArtifacts(n1.id, {}, [
      { severity: 'blocking', code: 'BLOCK', message: 'test', path: [] }
    ]);
    expect(graph.getNode(n1.id)!.status).toBe('broken');
  });

  it('8. Checkout mueve head', () => {
    const graph = new PromptGraph();
    const n1 = graph.addRoot('Nodo 1', 'project');
    const n2 = graph.branch(n1.id, 'Nodo 2', 'canon');

    expect(graph.getHead()).toBe(n2.id);
    graph.checkout(n1.id);
    expect(graph.getHead()).toBe(n1.id);
  });

  it('9. Checkout falla si el nodo no existe', () => {
    const graph = new PromptGraph();
    expect(() => {
      graph.checkout('non-existent-id');
    }).toThrowError('Node non-existent-id not found.');
  });

  it('10. debe serializar y deserializar el estado completo del grafo', () => {
    const graph = new PromptGraph();
    const root = graph.addRoot('Semilla', 'project');

    const json = graph.serialize();
    const restoredGraph = PromptGraph.deserialize(json);

    expect(restoredGraph.getHead()).toBe(root.id);
    expect(restoredGraph.getNode(root.id)?.promptText).toBe('Semilla');
  });
});
