import type { ReactNode } from 'react';

export interface TopologicalMinimapProps {
  className?: string;
}

export function TopologicalMinimap({ className }: TopologicalMinimapProps): React.JSX.Element {
  return (
    <div className={className}>
      <p>TopologicalMinimap</p>
    </div>
  );
}
