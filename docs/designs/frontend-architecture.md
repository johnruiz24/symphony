# Symphony Frontend Architecture Design

**Author:** frontend-architect
**Date:** 2026-03-18
**Status:** Phase 1 - Specification Lock
**Scope:** React SPA for Symphony task management + agent workload visualization

---

## 1. Project Structure (Vite + React + TypeScript)

```
frontend/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── .eslintrc.cjs
├── .prettierrc
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx                          # App entry point
│   ├── App.tsx                           # Root layout + providers
│   ├── api/
│   │   ├── client.ts                     # Base fetch wrapper (base URL, error handling)
│   │   ├── tasks.ts                      # Task API functions
│   │   ├── agents.ts                     # Agent API functions
│   │   └── events.ts                     # SSE connection manager
│   ├── hooks/
│   │   ├── useTasks.ts                   # TanStack Query: task CRUD
│   │   ├── useAgents.ts                  # TanStack Query: agent list
│   │   ├── useSSE.ts                     # SSE subscription + reconnection
│   │   ├── useUpdateTask.ts              # TanStack mutation: update task
│   │   ├── useReassignTask.ts            # TanStack mutation: drag-drop reassign
│   │   └── useCreateTask.ts             # TanStack mutation: create task
│   ├── types/
│   │   ├── task.ts                       # Task, TaskStatus, TaskPriority
│   │   ├── agent.ts                      # Agent, AgentStatus, AgentWorkload
│   │   └── events.ts                     # SSE event payload types
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx              # Main layout (agent strip + board)
│   │   │   └── AgentStrip.tsx            # TOP horizontal agent strip (60-80px)
│   │   ├── agents/
│   │   │   ├── AgentCard.tsx             # Single agent card (name, status, workload)
│   │   │   └── AgentDropZone.tsx         # Drop target wrapper for agent cards
│   │   ├── board/
│   │   │   ├── KanbanBoard.tsx           # Board container (columns by status)
│   │   │   ├── KanbanColumn.tsx          # Single column (backlog/todo/in_progress/done)
│   │   │   └── TaskCard.tsx              # Draggable task card
│   │   ├── tasks/
│   │   │   ├── TaskDetailModal.tsx       # Task view/edit modal
│   │   │   ├── CreateTaskDialog.tsx      # New task form dialog
│   │   │   └── TaskFilters.tsx           # Status/priority/assignee filters
│   │   └── shared/
│   │       ├── StatusBadge.tsx           # Reusable status indicator
│   │       ├── LoadingSpinner.tsx        # Loading state
│   │       ├── ErrorBanner.tsx           # Error display
│   │       └── StaleDataIndicator.tsx    # "Last updated X seconds ago"
│   ├── lib/
│   │   ├── constants.ts                  # API_BASE_URL, status enums, etc.
│   │   └── formatters.ts                # formatInt, formatTimestamp, truncate
│   └── styles/
│       └── index.css                     # Tailwind imports + custom tokens
└── tests/
    ├── setup.ts                          # Vitest setup (MSW, testing-library)
    ├── hooks/
    │   ├── useTasks.test.ts
    │   └── useSSE.test.ts
    └── components/
        ├── KanbanBoard.test.tsx
        └── AgentCard.test.tsx
```

---

## 2. Component Hierarchy

```
<App>
  <QueryClientProvider>           ← TanStack Query context
    <DndContext>                   ← dnd-kit context (drag-drop)
      <AppShell>
        ┌─────────────────────────────────────────────────────┐
        │  <AgentStrip>                          [TOP, 60-80px] │
        │    <AgentDropZone agent={a1}>                        │
        │      <AgentCard agent={a1} />                        │
        │    </AgentDropZone>                                   │
        │    <AgentDropZone agent={a2}>                        │
        │      <AgentCard agent={a2} />                        │
        │    </AgentDropZone>                                   │
        │    ...all active agents...                            │
        │  </AgentStrip>                                        │
        ├─────────────────────────────────────────────────────┤
        │  <TaskFilters />                                     │
        │  <KanbanBoard>                                       │
        │    <KanbanColumn status="backlog">                   │
        │      <TaskCard task={t1} />   ← draggable            │
        │      <TaskCard task={t2} />                          │
        │    </KanbanColumn>                                    │
        │    <KanbanColumn status="todo">                      │
        │      <TaskCard task={t3} />                          │
        │    </KanbanColumn>                                    │
        │    <KanbanColumn status="in_progress">               │
        │      <TaskCard task={t4} />                          │
        │    </KanbanColumn>                                    │
        │    <KanbanColumn status="done">                      │
        │      <TaskCard task={t5} />                          │
        │    </KanbanColumn>                                    │
        │  </KanbanBoard>                                       │
        └─────────────────────────────────────────────────────┘
        <TaskDetailModal />          ← rendered conditionally
        <CreateTaskDialog />         ← rendered conditionally
      </AppShell>
    </DndContext>
  </QueryClientProvider>
</App>
```

---

## 3. TypeScript Types

### Task Types (`src/types/task.ts`)

```typescript
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;                    // UUID, DynamoDB PK
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_agent: string | null; // agent ID or null
  tags: string[];
  created_at: string;            // ISO 8601
  updated_at: string;            // ISO 8601
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  tags?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
}

export interface ReassignTaskInput {
  agent_id: string;
}
```

### Agent Types (`src/types/agent.ts`)

```typescript
export type AgentStatus = 'idle' | 'working' | 'paused';

export interface AgentWorkload {
  active: number;     // currently executing
  queued: number;     // waiting in queue
  completed: number;  // finished tasks
}

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  current_task_id: string | null;
  workload: AgentWorkload;
  uptime: number;     // seconds
}
```

### SSE Event Types (`src/types/events.ts`)

```typescript
export type SSEEventType =
  | 'task_created'
  | 'task_updated'
  | 'task_reassigned'
  | 'agent_state_changed'
  | 'orchestrator_state_changed';

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
  timestamp: string;  // ISO 8601
}

export interface TaskEvent {
  task_id: string;
  status?: TaskStatus;
  assigned_agent?: string;
}

export interface AgentEvent {
  agent_id: string;
  status: AgentStatus;
  workload: AgentWorkload;
}
```

---

## 4. TanStack Query Hooks Design

### `useTasks` - Fetch & cache task list

```typescript
// src/hooks/useTasks.ts
import { useQuery } from '@tanstack/react-query';
import { fetchTasks } from '../api/tasks';
import type { Task, TaskStatus } from '../types/task';

interface UseTasksOptions {
  status?: TaskStatus;
  assignee?: string;
}

export function useTasks(options?: UseTasksOptions) {
  return useQuery({
    queryKey: ['tasks', options],
    queryFn: () => fetchTasks(options),
    staleTime: 10_000,        // 10s before refetch on focus
    refetchOnWindowFocus: true,
  });
}
```

### `useAgents` - Fetch & cache agent list

```typescript
// src/hooks/useAgents.ts
import { useQuery } from '@tanstack/react-query';
import { fetchAgents } from '../api/agents';

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
    staleTime: 5_000,         // agents change more frequently
    refetchOnWindowFocus: true,
  });
}
```

### `useReassignTask` - Drag-drop mutation

```typescript
// src/hooks/useReassignTask.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reassignTask } from '../api/tasks';
import type { Task } from '../types/task';

export function useReassignTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string }) =>
      reassignTask(taskId, agentId),

    // Optimistic update: immediately move task to agent
    onMutate: async ({ taskId, agentId }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = queryClient.getQueryData<Task[]>(['tasks']);

      queryClient.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) =>
          t.id === taskId ? { ...t, assigned_agent: agentId } : t
        )
      );

      return { previousTasks };
    },

    // Rollback on error
    onError: (_err, _vars, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks'], context.previousTasks);
      }
    },

    // Refetch to get server truth
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}
```

### `useCreateTask` - New task mutation

```typescript
// src/hooks/useCreateTask.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTask } from '../api/tasks';

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
```

### `useUpdateTask` - Status/field update mutation

```typescript
// src/hooks/useUpdateTask.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateTask } from '../api/tasks';
import type { Task } from '../types/task';

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: Partial<Task> }) =>
      updateTask(taskId, data),

    onMutate: async ({ taskId, data }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = queryClient.getQueryData<Task[]>(['tasks']);

      queryClient.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) => (t.id === taskId ? { ...t, ...data } : t))
      );

      return { previousTasks };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks'], context.previousTasks);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
```

---

## 5. SSE Integration Design

### `useSSE` - Connection + auto-reconnect + cache invalidation

```typescript
// src/hooks/useSSE.ts
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../lib/constants';

const SSE_URL = `${API_BASE_URL}/api/v1/events`;
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000]; // escalating backoff
const POLL_FALLBACK_INTERVAL = 10_000; // 10s polling if SSE fails

export function useSSE() {
  const queryClient = useQueryClient();
  const retryCount = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const es = new EventSource(SSE_URL);
      eventSourceRef.current = es;

      es.onopen = () => {
        retryCount.current = 0;
        // SSE connected: stop polling fallback
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      };

      // Listen for specific event types
      es.addEventListener('task_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      });

      es.addEventListener('task_created', () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      });

      es.addEventListener('task_reassigned', () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      });

      es.addEventListener('agent_state_changed', () => {
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      });

      es.addEventListener('orchestrator_state_changed', () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      });

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;

        // Start polling fallback
        if (!pollInterval) {
          pollInterval = setInterval(() => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['agents'] });
          }, POLL_FALLBACK_INTERVAL);
        }

        // Escalating reconnect
        const delay =
          RECONNECT_DELAYS[
            Math.min(retryCount.current, RECONNECT_DELAYS.length - 1)
          ];
        retryCount.current++;
        reconnectTimeout = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      eventSourceRef.current?.close();
      if (pollInterval) clearInterval(pollInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [queryClient]);
}
```

**Key design decisions:**

1. SSE events trigger TanStack Query `invalidateQueries` (not direct state writes). This keeps TanStack Query as the single source of truth for cached data.
2. Escalating reconnect backoff: 1s -> 2s -> 5s -> 10s (caps at 10s).
3. Polling fallback at 10s intervals when SSE is disconnected.
4. Cleanup on unmount prevents memory leaks.

---

## 6. Drag-Drop Architecture (dnd-kit)

### Why dnd-kit over react-beautiful-dnd

- `react-beautiful-dnd` is deprecated (Atlassian stopped maintaining it)
- `@dnd-kit` is actively maintained, tree-shakeable, accessible, framework-agnostic sensors
- Supports both pointer and keyboard sensors out of the box

### Setup in App.tsx

```typescript
// src/App.tsx
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

function App() {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const reassign = useReassignTask();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragStart(event: DragStartEvent) {
    const task = event.active.data.current?.task as Task;
    setActiveTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const dropTarget = over.data.current;

    // Drop on agent card -> reassign
    if (dropTarget?.type === 'agent') {
      reassign.mutate({ taskId, agentId: dropTarget.agentId });
    }

    // Drop on kanban column -> status change
    if (dropTarget?.type === 'column') {
      // handled by useUpdateTask
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
```

### Draggable TaskCard

```typescript
// src/components/board/TaskCard.tsx
import { useDraggable } from '@dnd-kit/core';

interface TaskCardProps {
  task: Task;
  isDragOverlay?: boolean;
}

export function TaskCard({ task, isDragOverlay }: TaskCardProps) {
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
      className={cn(
        'task-card rounded-lg border p-3 bg-white shadow-sm cursor-grab',
        isDragging && 'opacity-30',
        isDragOverlay && 'shadow-lg rotate-2'
      )}
      {...listeners}
      {...attributes}
    >
      <h3 className="text-sm font-medium">{task.title}</h3>
      <div className="flex items-center gap-2 mt-1">
        <StatusBadge status={task.status} />
        <span className="text-xs text-muted">{task.assigned_agent ?? 'Unassigned'}</span>
      </div>
    </div>
  );
}
```

### Droppable AgentDropZone

```typescript
// src/components/agents/AgentDropZone.tsx
import { useDroppable } from '@dnd-kit/core';

export function AgentDropZone({ agent, children }: { agent: Agent; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `agent-${agent.id}`,
    data: { type: 'agent', agentId: agent.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'transition-all duration-150',
        isOver && 'ring-2 ring-accent scale-105 bg-accent/5'
      )}
    >
      {children}
    </div>
  );
}
```

---

## 7. API Client Layer

### Base Client (`src/api/client.ts`)

```typescript
import { API_BASE_URL } from '../lib/constants';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new ApiError(
      resp.status,
      data?.error?.code ?? 'unknown',
      data?.error?.message ?? 'Request failed'
    );
  }

  return data as T;
}
```

### Task API (`src/api/tasks.ts`)

```typescript
import { apiFetch } from './client';
import type { Task, CreateTaskInput, UpdateTaskInput } from '../types/task';

export function fetchTasks(filters?: { status?: string; assignee?: string }): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.assignee) params.set('assignee', filters.assignee);
  const qs = params.toString();
  return apiFetch<Task[]>(`/api/v1/tasks${qs ? `?${qs}` : ''}`);
}

export function fetchTask(id: string): Promise<Task> {
  return apiFetch<Task>(`/api/v1/tasks/${id}`);
}

export function createTask(input: CreateTaskInput): Promise<Task> {
  return apiFetch<Task>('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return apiFetch<Task>(`/api/v1/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function reassignTask(taskId: string, agentId: string): Promise<Task> {
  return apiFetch<Task>(`/api/v1/tasks/${taskId}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId }),
  });
}
```

### Agent API (`src/api/agents.ts`)

```typescript
import { apiFetch } from './client';
import type { Agent } from '../types/agent';

export function fetchAgents(): Promise<Agent[]> {
  return apiFetch<Agent[]>('/api/v1/agents');
}
```

---

## 8. Vite + TypeScript Build Configuration

### `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### `package.json` (dependencies)

```json
{
  "name": "symphony-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@tanstack/react-query": "^5.60.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.15.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "postcss": "^8.4.49",
    "prettier": "^3.4.2",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^6.0.0",
    "vitest": "^2.1.8",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3"
  }
}
```

---

## 9. Key Architectural Decisions

### Decision 1: TanStack Query as the single source of truth for server state

SSE events do NOT directly write to component state. Instead, they call `queryClient.invalidateQueries()` which triggers a background refetch. This ensures:
- No stale optimistic state lingering
- Automatic deduplication of concurrent fetches
- Built-in retry and error handling via TanStack Query

### Decision 2: Vite proxy eliminates CORS issues in development

The `vite.config.ts` proxy configuration forwards `/api/*` requests to `localhost:4000`. This means:
- No CORS headers needed on the Elixir backend during development
- Frontend always uses relative URLs (`/api/v1/tasks`)
- Production deployment can use the same relative URLs behind a reverse proxy

### Decision 3: dnd-kit over react-beautiful-dnd

`react-beautiful-dnd` is deprecated. `@dnd-kit` provides:
- Active maintenance and modern API
- Built-in accessibility (keyboard sensors, screen reader announcements)
- Tree-shakeable (only import what you use)
- `DragOverlay` for smooth visual feedback during drag

### Decision 4: Optimistic updates for reassignment

Drag-drop reassignment uses optimistic updates via TanStack Query's `onMutate`:
- Immediately reflects the change in UI (no lag)
- Rolls back on server error (via `onError` callback)
- Refetches server truth on settle (via `onSettled` invalidation)

### Decision 5: Escalating SSE reconnection with polling fallback

SSE connection failures use escalating backoff (1s/2s/5s/10s max) and activate a 10-second polling fallback. This keeps the UI fresh even when SSE is unavailable without overwhelming the backend.

---

## 10. Data Flow Diagram

```
User drags task → agent card
         │
         ▼
  DndContext.onDragEnd()
         │
         ▼
  useReassignTask.mutate({ taskId, agentId })
         │
         ├─── optimistic: queryClient.setQueryData(['tasks'], ...)
         │         → UI updates instantly
         │
         ▼
  POST /api/v1/tasks/:id/reassign { agent_id }
         │
         ▼
  Elixir API Handler
         ├─ Update DynamoDB
         ├─ Publish PubSub event
         └─ Return 200 OK
         │
         ▼
  SSE broadcasts 'task_reassigned' event
         │
         ▼
  useSSE → queryClient.invalidateQueries(['tasks', 'agents'])
         │
         ▼
  TanStack Query refetches → UI shows server-confirmed state
```

---

## 11. Backend API Contract (for backend-architect coordination)

### Endpoints consumed by frontend

| Method | Path | Request Body | Response |
|--------|------|-------------|----------|
| GET | `/api/v1/tasks` | Query: `?status=&assignee=` | `Task[]` |
| GET | `/api/v1/tasks/:id` | - | `Task` |
| POST | `/api/v1/tasks` | `CreateTaskInput` | `Task` |
| PATCH | `/api/v1/tasks/:id` | `UpdateTaskInput` | `Task` |
| POST | `/api/v1/tasks/:id/reassign` | `{ agent_id: string }` | `Task` |
| GET | `/api/v1/agents` | - | `Agent[]` |
| GET | `/api/v1/events` | - | SSE stream |

### SSE Event Format (expected)

```
event: task_updated
data: {"task_id":"abc-123","status":"in_progress","assigned_agent":"agent-1"}

event: agent_state_changed
data: {"agent_id":"agent-1","status":"working","workload":{"active":1,"queued":2,"completed":5}}
```

### Error Response Format (expected)

```json
{
  "error": {
    "code": "not_found",
    "message": "Task not found"
  }
}
```

This matches the existing pattern in `ObservabilityApiController` at `elixir/lib/symphony_elixir_web/controllers/observability_api_controller.ex:50-54`.
