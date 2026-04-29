import { classNames } from './classNames.js';

export interface StickyPrimaryButtonProps {
  action: string;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  onIntent?: (payload: { action: string }) => void;
  onConfirmRequested?: (payload: { action: string }) => void;
}

export function StickyPrimaryButton({
  action,
  label,
  loading = false,
  disabled = false,
  className,
  onIntent,
  onConfirmRequested
}: StickyPrimaryButtonProps): React.JSX.Element {
  const isDisabled = disabled || loading;

  return (
    <div
      className={classNames('ontology-sticky-primary-button', className)}
      aria-busy={loading}
    >
      <button
        type="button"
        disabled={isDisabled}
        className="ontology-sticky-primary-button__intent"
        onClick={() => {
          onIntent?.({ action });
        }}
      >
        <span>{label}</span>
        {loading ? (
          <span className="ontology-sticky-primary-button__loading">
            Loading
          </span>
        ) : null}
      </button>
      {onConfirmRequested === undefined ? null : (
        <button
          type="button"
          disabled={isDisabled}
          className="ontology-sticky-primary-button__confirm"
          onClick={() => {
            onConfirmRequested({ action });
          }}
        >
          Confirm
        </button>
      )}
    </div>
  );
}
