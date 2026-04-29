import type { ReactNode } from 'react';
import { useId } from 'react';

import { classNames } from './classNames.js';

export interface ScreenProps {
  title?: string;
  mode?: 'operator' | 'manager' | 'auditor';
  className?: string;
  children: ReactNode;
}

export function Screen({
  title,
  mode = 'operator',
  className,
  children
}: ScreenProps): React.JSX.Element {
  const titleId = useId();
  const hasHeader = title !== undefined || mode !== undefined;

  return (
    <main
      aria-labelledby={title === undefined ? undefined : titleId}
      className={classNames('ontology-screen', `ontology-screen--${mode}`, className)}
      data-mode={mode}
    >
      {hasHeader ? (
        <header className="ontology-screen__header">
          {title === undefined ? null : (
            <h1 id={titleId} className="ontology-screen__title">
              {title}
            </h1>
          )}
          <p className="ontology-screen__mode" aria-label={`Mode: ${mode}`}>
            {mode}
          </p>
        </header>
      ) : null}
      <div className="ontology-screen__body">{children}</div>
    </main>
  );
}
