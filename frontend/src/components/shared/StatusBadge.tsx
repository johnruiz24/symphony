import type { TaskStatus } from '@/types/task';
import type { AgentStatus } from '@/types/agent';

const STATUS_STYLES: Record<string, string> = {
  backlog: 'bg-gray-100 text-gray-700',
  todo: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  done: 'bg-green-100 text-green-800',
  idle: 'bg-gray-100 text-gray-600',
  working: 'bg-accent-soft text-accent-ink',
  retrying: 'bg-amber-100 text-amber-800',
  offline: 'bg-danger-soft text-danger',
};

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  idle: 'Idle',
  working: 'Working',
  paused: 'Paused',
};

interface StatusBadgeProps {
  status: TaskStatus | AgentStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
