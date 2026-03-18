import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Task } from '@/types/task';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { truncate } from '@/lib/formatters';
import { PRIORITY_LABELS } from '@/lib/constants';

interface TaskCardProps {
  task: Task;
  isDragOverlay?: boolean;
  onClick?: () => void;
}

export const TaskCard = memo(function TaskCard({
  task,
  isDragOverlay,
  onClick,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: { task },
    });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-line bg-white p-3 shadow-sm cursor-grab select-none transition-shadow hover:shadow-md ${
        isDragging ? 'opacity-30' : ''
      } ${isDragOverlay ? 'shadow-lg rotate-2' : ''}`}
      onClick={isDragging ? undefined : onClick}
      {...listeners}
      {...attributes}
    >
      <h3 className="text-sm font-medium text-ink">
        {truncate(task.title, 60)}
      </h3>
      {task.description && (
        <p className="mt-1 text-xs text-muted">
          {truncate(task.description, 80)}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <StatusBadge status={task.status} />
        <span className="text-xs text-muted">
          {PRIORITY_LABELS[task.priority] ?? task.priority}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-muted">
          {task.assigned_agent ?? 'Unassigned'}
        </span>
        {task.tags.length > 0 && (
          <div className="flex gap-1">
            {task.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded bg-page-deep px-1.5 py-0.5 text-xs text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
