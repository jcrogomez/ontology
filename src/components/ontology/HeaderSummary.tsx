import { useId } from 'react';

import { classNames } from './classNames.js';
import { OfflineSyncBadge } from './OfflineSyncBadge.js';

export interface HeaderSummaryField {
  label: string;
  value: string | number | null | undefined;
}

export interface HeaderSummaryProps {
  title?: string;
  fields?: HeaderSummaryField[];
  syncStatus?: 'online' | 'offline' | 'queued' | 'syncing';
  className?: string;
}

export function HeaderSummary({
  title = 'Summary',
  fields = [],
  syncStatus,
  className
}: HeaderSummaryProps): React.JSX.Element {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={classNames('ontology-header-summary', className)}
    >
      <div className="ontology-header-summary__header">
        <h2 id={titleId} className="ontology-header-summary__title">
          {title}
        </h2>
        {syncStatus === undefined ? null : (
          <OfflineSyncBadge status={syncStatus} />
        )}
      </div>
      {fields.length === 0 ? null : (
        <dl className="ontology-header-summary__fields">
          {fields.map((field) => (
            <div
              key={field.label}
              className="ontology-header-summary__field"
            >
              <dt className="ontology-header-summary__label">{field.label}</dt>
              <dd className="ontology-header-summary__value">
                {formatSummaryValue(field.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function formatSummaryValue(
  value: HeaderSummaryField['value']
): string | number {
  if (value === null || value === undefined) {
    return 'Not available';
  }

  return value;
}
