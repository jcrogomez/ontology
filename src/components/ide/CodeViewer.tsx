import type { ReactNode } from 'react';

export interface CodeViewerProps {
  code?: string;
  language?: string;
  className?: string;
}

export function CodeViewer({ code, language, className }: CodeViewerProps): React.JSX.Element {
  return (
    <div className={className}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
