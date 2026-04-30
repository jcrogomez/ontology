import type { ReactNode } from 'react';

export interface GraphVisualizerProps {
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
