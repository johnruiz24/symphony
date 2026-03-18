import { TASK_STATUSES, TASK_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import type { TaskStatus, TaskPriority } from '@/types/task';

interface TaskFiltersProps {
  statusFilter: TaskStatus | '';
  priorityFilter: TaskPriority | '';
  searchQuery: string;
  onStatusChange: (status: TaskStatus | '') => void;
  onPriorityChange: (priority: TaskPriority | '') => void;
  onSearchChange: (query: string) => void;
}

export function TaskFilters({
  statusFilter,
  priorityFilter,
  searchQuery,
  onStatusChange,
  onPriorityChange,
  onSearchChange,
}: TaskFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2">
      <input
        type="text"
        placeholder="Search tasks..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as TaskStatus | '')}
        className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
      >
        <option value="">All Statuses</option>
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <select
        value={priorityFilter}
        onChange={(e) => onPriorityChange(e.target.value as TaskPriority | '')}
        className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
      >
        <option value="">All Priorities</option>
        {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
