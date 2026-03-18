import type { TaskStatus } from './task';
import type { AgentStatus, AgentWorkload } from './agent';

export type SSEEventType =
  | 'connected'
  | 'snapshot'
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'task:reassigned'
  | 'agent:updated'
  | 'heartbeat';

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
  timestamp: string;
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
