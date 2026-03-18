import { apiFetch } from './client';
import type { Task, CreateTaskInput, UpdateTaskInput } from '@/types/task';

interface TaskListResponse {
  data: Task[];
  meta: { count: number; next_cursor?: string };
}

interface TaskResponse {
  data: Task;
}

export async function fetchTasks(filters?: {
  status?: string;
  assignee?: string;
}): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.assignee) params.set('assignee', filters.assignee);
  const qs = params.toString();
  const resp = await apiFetch<TaskListResponse>(`/api/v1/tasks${qs ? `?${qs}` : ''}`);
  return resp.data;
}

export async function fetchTask(id: string): Promise<Task> {
  const resp = await apiFetch<TaskResponse>(`/api/v1/tasks/${id}`);
  return resp.data;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const resp = await apiFetch<TaskResponse>('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return resp.data;
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const resp = await apiFetch<TaskResponse>(`/api/v1/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return resp.data;
}

export async function reassignTask(taskId: string, agentId: string): Promise<Task> {
  const resp = await apiFetch<TaskResponse>(`/api/v1/tasks/${taskId}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId }),
  });
  return resp.data;
}
