import { useState } from 'react';
import type { Task, TaskStatus, TaskPriority } from '@/types/task';
import { useUpdateTask } from '@/hooks/useUpdateTask';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatTimestamp } from '@/lib/formatters';
import { TASK_STATUSES, TASK_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
}

export function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const updateTask = useUpdateTask();

  function handleSave() {
    updateTask.mutate(
      {
        taskId: task.id,
        data: { title, description, status, priority },
      },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      }
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          {isEditing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-line px-2 py-1 text-lg font-semibold text-ink focus:border-accent focus:outline-none"
            />
          ) : (
            <h2 className="text-lg font-semibold text-ink">{task.title}</h2>
          )}
          <button
            onClick={onClose}
            className="ml-4 text-muted hover:text-ink"
            aria-label="Close"
          >
            X
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          {isEditing ? (
            <>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="rounded border border-line px-2 py-1 text-sm"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                ))}
              </select>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="rounded border border-line px-2 py-1 text-sm"
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <StatusBadge status={task.status} />
              <span className="text-sm text-muted">
                {PRIORITY_LABELS[task.priority]} priority
              </span>
            </>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-muted">
            Description
          </label>
          {isEditing ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          ) : (
            <p className="text-sm text-ink">
              {task.description || 'No description'}
            </p>
          )}
        </div>

        <div className="mb-4 flex gap-4 text-xs text-muted">
          <span>Assigned: {task.assigned_agent ?? 'Unassigned'}</span>
          <span>Created: {formatTimestamp(task.created_at)}</span>
          <span>Updated: {formatTimestamp(task.updated_at)}</span>
        </div>

        {task.tags.length > 0 && (
          <div className="mb-4 flex gap-1">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-page-deep px-2 py-0.5 text-xs text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:bg-page-soft"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={updateTask.isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-50"
              >
                {updateTask.isPending ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:bg-page-soft"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
