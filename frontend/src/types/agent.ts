export type AgentStatus = 'idle' | 'working' | 'retrying' | 'offline';

export interface AgentWorkload {
  active: number;
  queued: number;
  completed: number;
}

export interface AgentCurrentTask {
  issue_id: string;
  issue_identifier: string;
  state: string;
  started_at: string;
  turn_count: number;
  last_event: string;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  worker_host?: string;
  workload: AgentWorkload;
  current_task?: AgentCurrentTask;
  uptime_seconds: number;
}
