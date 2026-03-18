import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Task } from '@/types/task';
import { useReassignTask } from '@/hooks/useReassignTask';
import { useUpdateTask } from '@/hooks/useUpdateTask';
import { AppShell } from '@/components/layout/AppShell';
import { TaskCard } from '@/components/board/TaskCard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

function DndRoot() {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const reassign = useReassignTask();
  const updateTask = useUpdateTask();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragStart(event: DragStartEvent) {
    const task = event.active.data.current?.task as Task | undefined;
    setActiveTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const dropTarget = over.data.current;

    if (dropTarget?.type === 'agent') {
      reassign.mutate({ taskId, agentId: dropTarget.agentId });
    }

    if (dropTarget?.type === 'column') {
      updateTask.mutate({ taskId, data: { status: dropTarget.status } });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <AppShell />
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} isDragOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DndRoot />
    </QueryClientProvider>
  );
}
