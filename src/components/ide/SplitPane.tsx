import type { ReactNode } from 'react';

export interface SplitPaneProps {
  orientation?: 'horizontal' | 'vertical' | string;
  className?: string;
  children?: ReactNode;
}

export function SplitPane({ orientation, className, children }: SplitPaneProps): React.JSX.Element {
  return (
    <div className={className} data-orientation={orientation}>
      {children}
    </div>
  );
}
