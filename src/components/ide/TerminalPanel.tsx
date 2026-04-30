import type { ReactNode } from 'react';

export interface TerminalPanelProps {
  output?: string;
  className?: string;
}

export function TerminalPanel({ output, className }: TerminalPanelProps): React.JSX.Element {
  return (
    <div className={className}>
      <pre>{output}</pre>
    </div>
  );
}
