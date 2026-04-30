import type { ReactNode } from 'react';

export interface NodeCardProps {
  title?: string;
  description?: string;
  className?: string;
  children?: ReactNode;
}

export function NodeCard({ title, description, className, children }: NodeCardProps): React.JSX.Element {
  return (
    <div className={className}>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
