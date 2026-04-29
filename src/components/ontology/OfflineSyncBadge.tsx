import { classNames } from './classNames.js';

export interface OfflineSyncBadgeProps {
  status: 'online' | 'offline' | 'queued' | 'syncing';
  className?: string;
}

const STATUS_LABELS: Record<OfflineSyncBadgeProps['status'], string> = {
  online: 'Online',
  offline: 'Offline',
  queued: 'Queued',
  syncing: 'Syncing'
};

export function OfflineSyncBadge({
  status,
  className
}: OfflineSyncBadgeProps): React.JSX.Element {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Sync status: ${STATUS_LABELS[status]}`}
      className={classNames(
        'ontology-offline-sync-badge',
        `ontology-offline-sync-badge--${status}`,
        className
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
