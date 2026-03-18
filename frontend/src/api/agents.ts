import { apiFetch } from './client';
import type { Agent } from '@/types/agent';

interface AgentListResponse {
  data: Agent[];
  meta: { count: number; snapshot_at: string };
}

export async function fetchAgents(): Promise<Agent[]> {
  const resp = await apiFetch<AgentListResponse>('/api/v1/agents');
  return resp.data;
}
