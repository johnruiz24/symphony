import { formatTimeAgo } from '@/lib/formatters';

interface StaleDataIndicatorProps {
  updatedAt: string;
}

export function StaleDataIndicator({ updatedAt }: StaleDataIndicatorProps) {
  return (
    <span className="text-xs text-muted">
      Updated {formatTimeAgo(updatedAt)}
    </span>
  );
}
