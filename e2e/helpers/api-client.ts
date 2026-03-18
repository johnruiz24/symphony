import { APIRequestContext } from "@playwright/test";

/**
 * Typed API client for Symphony backend endpoints.
 * Types match the actual implementation in:
 *   - task_controller.ex + task_presenter.ex (TaskPresenter.task_payload/1)
 *   - agent_controller.ex (TaskPresenter.agents_payload/2)
 *   - event_controller.ex (SSE with {type, data, timestamp} JSON)
 *   - observability_api_controller.ex + presenter.ex
 */

// ---------- Task types (from TaskPresenter.task_payload/1) ----------

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "backlog" | "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assigned_agent: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

/** GET /api/v1/tasks returns {data: Task[], meta: {count: number, next_cursor: string|null}} */
export interface TaskListResponse {
  data: Task[];
  meta: { count: number; next_cursor: string | null };
}

/** GET/POST/PATCH /api/v1/tasks/:id returns {data: Task} */
export interface TaskSingleResponse {
  data: Task;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  assigned_agent?: string;
  tags?: string[];
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  assigned_agent?: string | null;
  tags?: string[];
}

// ---------- Agent types (from TaskPresenter.agents_payload/2) ----------

export interface Agent {
  id: string;
  identifier: string;
  status: string;
  worker_host: string | null;
  session_id: string | null;
  workload: {
    active_task: string;
    turn_count: number;
    runtime_seconds: number;
  };
  tokens: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  retry?: {
    attempt: number;
    error: string | null;
  };
  started_at: string | null;
  last_event_at: string | null;
}

/** GET /api/v1/agents returns {data: Agent[], meta: {count: number, snapshot_at: string}} */
export interface AgentListResponse {
  data: Agent[];
  meta: { count: number; snapshot_at: string };
}

// ---------- SSE types (from EventController.send_sse_event/3) ----------

export interface SSEEventPayload {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface SSEEvent {
  event: string;
  data: SSEEventPayload;
}

// ---------- Existing observability types (from Presenter) ----------

export interface OrchestrationState {
  generated_at: string;
  counts: { running: number; retrying: number };
  running: RunningEntry[];
  retrying: RetryEntry[];
  codex_totals: CodexTotals;
  rate_limits: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface RunningEntry {
  issue_id: string;
  issue_identifier: string;
  state: string;
  worker_host: string;
  workspace_path: string;
  session_id: string;
  turn_count: number;
  last_event: string;
  last_message: string;
  started_at: string;
  last_event_at: string;
  tokens: { input_tokens: number; output_tokens: number; total_tokens: number };
}

export interface RetryEntry {
  issue_id: string;
  issue_identifier: string;
  attempt: number;
  due_at: string;
  error: string;
  worker_host: string | null;
  workspace_path: string;
}

export interface CodexTotals {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  seconds_running: number;
}

export interface ErrorResponse {
  error: { code: string; message: string };
}

// ---------- API client ----------

export class SymphonyAPI {
  constructor(private request: APIRequestContext) {}

  // -- Existing observability endpoints --

  async getState(): Promise<OrchestrationState> {
    const resp = await this.request.get("/api/v1/state");
    return resp.json();
  }

  async getIssue(issueIdentifier: string) {
    const resp = await this.request.get(`/api/v1/${issueIdentifier}`);
    return { status: resp.status(), body: await resp.json() };
  }

  async triggerRefresh() {
    const resp = await this.request.post("/api/v1/refresh");
    return { status: resp.status(), body: await resp.json() };
  }

  // -- Task CRUD endpoints --

  async listTasks(params?: { status?: string; priority?: string; assignee?: string }) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.priority) query.set("priority", params.priority);
    if (params?.assignee) query.set("assignee", params.assignee);
    const qs = query.toString();
    const url = `/api/v1/tasks${qs ? `?${qs}` : ""}`;
    const resp = await this.request.get(url);
    return { status: resp.status(), body: await resp.json() as TaskListResponse };
  }

  async createTask(payload: CreateTaskPayload) {
    const resp = await this.request.post("/api/v1/tasks", { data: payload });
    return { status: resp.status(), body: await resp.json() as TaskSingleResponse | ErrorResponse };
  }

  async getTask(taskId: string) {
    const resp = await this.request.get(`/api/v1/tasks/${taskId}`);
    return { status: resp.status(), body: await resp.json() as TaskSingleResponse | ErrorResponse };
  }

  async updateTask(taskId: string, payload: UpdateTaskPayload) {
    const resp = await this.request.patch(`/api/v1/tasks/${taskId}`, { data: payload });
    return { status: resp.status(), body: await resp.json() as TaskSingleResponse | ErrorResponse };
  }

  async reassignTask(taskId: string, agentId: string) {
    const resp = await this.request.post(`/api/v1/tasks/${taskId}/reassign`, {
      data: { agent_id: agentId },
    });
    return { status: resp.status(), body: await resp.json() as TaskSingleResponse | ErrorResponse };
  }

  // -- Agent endpoints (read-only, derived from orchestrator state) --

  async listAgents() {
    const resp = await this.request.get("/api/v1/agents");
    return { status: resp.status(), body: await resp.json() as AgentListResponse };
  }

  // -- SSE helper --

  async connectSSE(timeoutMs: number = 5000): Promise<SSEEvent[]> {
    const events: SSEEvent[] = [];
    const resp = await this.request.get("/api/v1/events", {
      headers: { Accept: "text/event-stream" },
      timeout: timeoutMs,
    });
    const text = await resp.text();
    for (const block of text.split("\n\n")) {
      const lines = block.trim().split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data = line.slice(5).trim();
      }
      if (data) {
        try {
          events.push({ event, data: JSON.parse(data) });
        } catch {
          events.push({ event, data: { type: event, data: { raw: data }, timestamp: "" } });
        }
      }
    }
    return events;
  }
}
