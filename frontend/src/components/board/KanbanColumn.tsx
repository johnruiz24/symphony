import { useDroppable } from '@dnd-kit/core';
import type { Task, TaskStatus } from '@/types/task';
import { TaskCard } from './TaskCard';
import { TASK_STATUS_LABELS } from '@/lib/constants';

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function KanbanColumn({ status, tasks, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: 'column', status },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 flex-shrink-0 flex-col rounded-xl bg-page-soft p-3 transition-colors ${
        isOver ? 'bg-accent-soft/20' : ''
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-ink">
          {TASK_STATUS_LABELS[status] ?? status}
        </h2>
        <span className="rounded-full bg-page-deep px-2 py-0.5 text-xs font-medium text-muted">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task)}
          />
        ))}
      </div>
    </div>
  );
}
