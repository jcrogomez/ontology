import { useEffect, useId, useState } from 'react';

import { classNames } from './classNames.js';

export interface NumericWeightInputProps {
  field: string;
  label?: string;
  unit?: string;
  size?: 'small' | 'medium' | 'large';
  required?: boolean;
  autofocus?: boolean;
  disabled?: boolean;
  value?: number | null;
  error?: string | null;
  className?: string;
  onValueChange?: (payload: {
    field: string;
    value: number | null;
    unit?: string;
  }) => void;
  onValueCommit?: (payload: {
    field: string;
    value: number;
    unit?: string;
    source: 'manual';
  }) => void;
}

export function NumericWeightInput({
  field,
  label,
  unit,
  size = 'medium',
  required = false,
  autofocus = false,
  disabled = false,
  value = null,
  error = null,
  className,
  onValueChange,
  onValueCommit
}: NumericWeightInputProps): React.JSX.Element {
  const inputId = useId();
  const errorId = useId();
  const unitId = useId();
  const [draftValue, setDraftValue] = useState(() => formatNumericValue(value));

  useEffect(() => {
    setDraftValue(formatNumericValue(value));
  }, [value]);

  const describedBy = [
    unit === undefined ? undefined : unitId,
    error === null ? undefined : errorId
  ]
    .filter((item): item is string => item !== undefined)
    .join(' ');

  return (
    <div
      className={classNames(
        'ontology-numeric-weight-input',
        `ontology-numeric-weight-input--${size}`,
        disabled && 'ontology-numeric-weight-input--disabled',
        error !== null && 'ontology-numeric-weight-input--error',
        className
      )}
    >
      <label htmlFor={inputId} className="ontology-numeric-weight-input__label">
        {label ?? field}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <div className="ontology-numeric-weight-input__control">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          step="any"
          autoFocus={autofocus}
          required={required}
          disabled={disabled}
          value={draftValue}
          aria-invalid={error === null ? undefined : true}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          className="ontology-numeric-weight-input__input"
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setDraftValue(nextValue);
            onValueChange?.({
              field,
              value: parseNumericValue(nextValue),
              ...(unit === undefined ? {} : { unit })
            });
          }}
          onBlur={() => {
            const parsedValue = parseNumericValue(draftValue);

            if (parsedValue === null) {
              return;
            }

            onValueCommit?.({
              field,
              value: parsedValue,
              source: 'manual',
              ...(unit === undefined ? {} : { unit })
            });
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') {
              return;
            }

            event.preventDefault();
            event.currentTarget.blur();
          }}
        />
        {unit === undefined ? null : (
          <span
            id={unitId}
            className="ontology-numeric-weight-input__unit"
          >
            {unit}
          </span>
        )}
      </div>
      {error === null ? null : (
        <p
          id={errorId}
          role="alert"
          className="ontology-numeric-weight-input__error"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function formatNumericValue(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  return `${value}`;
}

function parseNumericValue(value: string): number | null {
  if (value.trim() === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}
