import { useState, useMemo } from 'react';
import type { Task, TaskStatus, TaskPriority } from '@/types/task';
import { useTasks } from '@/hooks/useTasks';
import { useSSE } from '@/hooks/useSSE';
import { AgentStrip } from './AgentStrip';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { TaskFilters } from '@/components/tasks/TaskFilters';
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal';
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

export function AppShell() {
  useSSE();

  const { data: tasks, isLoading, error, refetch } = useTasks();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description?.toLowerCase().includes(q) ?? false) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, searchQuery]);

  return (
    <div className="flex h-screen flex-col bg-page">
      <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-ink">Symphony</h1>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-ink"
        >
          + New Task
        </button>
      </header>

      <AgentStrip />

      <TaskFilters
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        searchQuery={searchQuery}
        onStatusChange={setStatusFilter}
        onPriorityChange={setPriorityFilter}
        onSearchChange={setSearchQuery}
      />

      {isLoading && <LoadingSpinner />}
      {error && (
        <div className="p-4">
          <ErrorBanner message="Failed to load tasks" onRetry={() => refetch()} />
        </div>
      )}
      {tasks && (
        <div className="flex-1 overflow-hidden">
          <KanbanBoard
            tasks={filteredTasks}
            onTaskClick={setSelectedTask}
          />
        </div>
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
      {showCreateDialog && (
        <CreateTaskDialog onClose={() => setShowCreateDialog(false)} />
      )}
    </div>
  );
}
