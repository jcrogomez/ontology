import { useEffect, useId, useState } from 'react';

import { classNames } from './classNames.js';

export interface VarianceAlertProps {
  variance?: number | null;
  threshold?: number;
  requiresReason?: boolean;
  reason?: string;
  className?: string;
  onReasonChange?: (payload: { reason: string }) => void;
  onReasonProvided?: (payload: { reason: string }) => void;
  onDismissRequested?: () => void;
}

export function VarianceAlert({
  variance = null,
  threshold = 0,
  requiresReason = false,
  reason = '',
  className,
  onReasonChange,
  onReasonProvided,
  onDismissRequested
}: VarianceAlertProps): React.JSX.Element {
  const titleId = useId();
  const reasonId = useId();
  const [draftReason, setDraftReason] = useState(reason);
  const hasVariance = variance !== null && variance !== undefined;
  const exceedsThreshold = hasVariance && Math.abs(variance) >= threshold;

  useEffect(() => {
    setDraftReason(reason);
  }, [reason]);

  return (
    <section
      role={exceedsThreshold || requiresReason ? 'alert' : 'status'}
      aria-labelledby={titleId}
      className={classNames(
        'ontology-variance-alert',
        exceedsThreshold && 'ontology-variance-alert--elevated',
        requiresReason && 'ontology-variance-alert--reason-required',
        className
      )}
    >
      <div className="ontology-variance-alert__header">
        <h2 id={titleId} className="ontology-variance-alert__title">
          Variance alert
        </h2>
        {onDismissRequested === undefined ? null : (
          <button
            type="button"
            className="ontology-variance-alert__dismiss"
            onClick={() => {
              onDismissRequested();
            }}
          >
            Dismiss
          </button>
        )}
      </div>
      <p className="ontology-variance-alert__message">
        {buildVarianceMessage(variance, threshold)}
      </p>
      {requiresReason ? (
        <div className="ontology-variance-alert__reason">
          <label
            htmlFor={reasonId}
            className="ontology-variance-alert__reason-label"
          >
            Reason
          </label>
          <textarea
            id={reasonId}
            value={draftReason}
            className="ontology-variance-alert__reason-input"
            onChange={(event) => {
              const nextReason = event.currentTarget.value;
              setDraftReason(nextReason);
              onReasonChange?.({ reason: nextReason });
            }}
            onBlur={() => {
              onReasonProvided?.({ reason: draftReason });
            }}
          />
        </div>
      ) : null}
    </section>
  );
}

function buildVarianceMessage(
  variance: number | null,
  threshold: number
): string {
  if (variance === null || variance === undefined) {
    return 'No variance has been provided yet.';
  }

  const direction = variance >= 0 ? 'above' : 'below';
  const absoluteVariance = Math.abs(variance);

  if (absoluteVariance >= threshold) {
    return `Variance is ${absoluteVariance}% ${direction} the expected threshold.`;
  }

  return `Variance is ${absoluteVariance}% ${direction} the expected value.`;
}
