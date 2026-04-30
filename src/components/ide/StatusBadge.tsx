import type { ReactNode } from 'react';

export interface StatusBadgeProps {
  status?: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps): React.JSX.Element {
  return (
    <div className={className}>
      <span>{status}</span>
    </div>
  );
}
