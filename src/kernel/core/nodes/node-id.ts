export function createSequentialNodeId(nodeCount: number): string {
  return `node_${String(nodeCount).padStart(4, "0")}`;
}
