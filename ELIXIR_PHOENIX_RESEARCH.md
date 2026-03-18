# Elixir/Phoenix Best Practices Research

## 1. REST API Endpoints (CRUD for Tasks)

### Phoenix Router Configuration
Phoenix provides declarative routing with the `resources/2` macro for standard CRUD operations. For JSON APIs, exclude `:new` and `:edit` actions since they're HTML-only.

**File:** `/lib/symphony_elixir_web/router.ex` - Symphony pattern (production):
```elixir
scope "/api", SymphonyElixirWeb do
  get("/v1/state", ObservabilityApiController, :state)
  post("/v1/refresh", ObservabilityApiController, :refresh)
  get("/v1/:issue_identifier", ObservabilityApiController, :issue)

  # Catch invalid methods
  match(:*, "/v1/state", ObservabilityApiController, :method_not_allowed)
  match(:*, "/v1/refresh", ObservabilityApiController, :method_not_allowed)
end
```

**Standard Pattern (from Context7):**
```elixir
scope "/api", HelloWeb do
  pipe_through :api
  resources "/articles", ArticleController, except: [:new, :edit]
end
```

This generates 7 standard routes:
- `GET /articles` → index (list all)
- `POST /articles` → create (create new)
- `GET /articles/:id` → show (get one)
- `PATCH /articles/:id` → update (update)
- `PUT /articles/:id` → update (alternative)
- `DELETE /articles/:id` → delete

### Controller Implementation Pattern

**Symphony Real-World Example** (`ObservabilityApiController`):
```elixir
defmodule SymphonyElixirWeb.ObservabilityApiController do
  use Phoenix.Controller, formats: [:json]

  alias Plug.Conn
  alias SymphonyElixirWeb.{Endpoint, Presenter}

  @spec state(Conn.t(), map()) :: Conn.t()
  def state(conn, _params) do
    json(conn, Presenter.state_payload(orchestrator(), snapshot_timeout_ms()))
  end

  @spec issue(Conn.t(), map()) :: Conn.t()
  def issue(conn, %{"issue_identifier" => issue_identifier}) do
    case Presenter.issue_payload(issue_identifier, orchestrator(), snapshot_timeout_ms()) do
      {:ok, payload} ->
        json(conn, payload)

      {:error, :issue_not_found} ->
        error_response(conn, 404, "issue_not_found", "Issue not found")
    end
  end

  defp orchestrator do
    Endpoint.config(:orchestrator) || SymphonyElixir.Orchestrator
  end
end
```

**Key Patterns:**
- Use `use Phoenix.Controller, formats: [:json]` for JSON-only APIs
- Pattern match on parameters: `%{"id" => id}`
- Use `json(conn, data)` to return JSON responses
- Always set appropriate HTTP status codes
- Return tuples from business logic, handle in controller

### Standard CRUD Controller Template
```elixir
defmodule MyAppWeb.TaskController do
  use Phoenix.Controller, formats: [:json]

  alias MyApp.Tasks
  alias MyApp.Tasks.Task

  # List all tasks
  def index(conn, _params) do
    tasks = Tasks.list_tasks()
    json(conn, tasks)
  end

  # Get a single task
  def show(conn, %{"id" => id}) do
    case Tasks.get_task(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Task not found"})
      task ->
        json(conn, task)
    end
  end

  # Create a new task
  def create(conn, %{"task" => task_params}) do
    case Tasks.create_task(task_params) do
      {:ok, task} ->
        conn |> put_status(:created) |> json(task)
      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: error_details(changeset)})
    end
  end

  # Update a task
  def update(conn, %{"id" => id, "task" => task_params}) do
    case Tasks.update_task(id, task_params) do
      {:ok, task} ->
        json(conn, task)
      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: error_details(changeset)})
    end
  end

  # Delete a task
  def delete(conn, %{"id" => id}) do
    case Tasks.delete_task(id) do
      :ok ->
        send_resp(conn, :no_content, "")
      {:error, _reason} ->
        conn |> put_status(:not_found) |> json(%{error: "Task not found"})
    end
  end

  defp error_details(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end
end
```

---

## 2. SSE (Server-Sent Events) Streaming

### Overview
SSE enables server-to-client streaming over HTTP. Perfect for real-time updates without WebSocket complexity.

### Phoenix SSE Implementation Pattern
```elixir
defmodule MyAppWeb.StreamController do
  use Phoenix.Controller, formats: [:json]

  def stream_updates(conn, %{"id" => id}) do
    conn
    |> put_resp_header("content-type", "text/event-stream")
    |> put_resp_header("cache-control", "no-cache")
    |> put_resp_header("connection", "keep-alive")
    |> send_chunked(200)
    |> stream_task_updates(id)
  end

  defp stream_task_updates(conn, task_id) do
    case stream_loop(conn, task_id, 0) do
      {:ok, conn} -> conn
      {:error, _reason} -> conn
    end
  end

  defp stream_loop(conn, _task_id, count) when count > 100 do
    # Send stream end after 100 events
    chunk(conn, "event: end\n\n")
  end

  defp stream_loop(conn, task_id, count) do
    # Simulate event streaming - in production, poll from cache/GenServer
    case chunk(conn, "data: #{Jason.encode!(%{task_id: task_id, count: count})}\n\n") do
      {:ok, conn} ->
        Process.sleep(1000)
        stream_loop(conn, task_id, count + 1)
      {:error, _reason} = err ->
        err
    end
  end
end
```

### Client-Side Usage
```javascript
const eventSource = new EventSource("/api/stream/tasks/123");

eventSource.addEventListener("data", (event) => {
  const data = JSON.parse(event.data);
  console.log("Update:", data);
});

eventSource.addEventListener("end", () => {
  console.log("Stream complete");
  eventSource.close();
});

eventSource.addEventListener("error", () => {
  console.log("Connection lost");
});
```

---

## 3. GenServer State Management for Orchestrator Integration

### GenServer Fundamentals
GenServer implements the client-server pattern for stateful processes. Symphony uses this extensively for the Orchestrator.

### Symphony's Orchestrator Pattern (Production)

**File:** `/lib/symphony_elixir/orchestrator.ex` (1,655 lines)

**State Structure:**
```elixir
defmodule SymphonyElixir.Orchestrator.State do
  defstruct [
    :poll_interval_ms,
    :max_concurrent_agents,
    :next_poll_due_at_ms,
    :poll_check_in_progress,
    :tick_timer_ref,
    :tick_token,
    running: %{},                    # Map of active tasks
    completed: MapSet.new(),          # Completed task IDs
    claimed: MapSet.new(),            # Claimed task IDs
    retry_attempts: %{},              # Retry tracking
    codex_totals: nil,
    codex_rate_limits: nil
  ]
end
```

**Key Patterns from Symphony:**

1. **Initialization with Configuration**
```elixir
@spec start_link(keyword()) :: GenServer.on_start()
def start_link(opts \\ []) do
  name = Keyword.get(opts, :name, __MODULE__)
  GenServer.start_link(__MODULE__, opts, name: name)
end

@impl true
def init(_opts) do
  now_ms = System.monotonic_time(:millisecond)
  config = Config.settings!()

  state = %State{
    poll_interval_ms: config.polling.interval_ms,
    max_concurrent_agents: config.agent.max_concurrent_agents,
    next_poll_due_at_ms: now_ms,
    poll_check_in_progress: false,
    tick_timer_ref: nil,
    tick_token: nil,
    codex_totals: @empty_codex_totals,
    codex_rate_limits: nil
  }

  state = schedule_tick(state, 0)
  {:ok, state}
end
```

2. **Tick-Based Polling Pattern**
```elixir
@impl true
def handle_info({:tick, tick_token}, %{tick_token: tick_token} = state)
    when is_reference(tick_token) do
  state = refresh_runtime_config(state)

  state = %{
    state
    | poll_check_in_progress: true,
      next_poll_due_at_ms: nil,
      tick_timer_ref: nil,
      tick_token: nil
  }

  notify_dashboard()
  :ok = schedule_poll_cycle_start()
  {:noreply, state}
end

def handle_info(:run_poll_cycle, state) do
  state = refresh_runtime_config(state)
  state = maybe_dispatch(state)
  state = schedule_tick(state, state.poll_interval_ms)
  state = %{state | poll_check_in_progress: false}

  notify_dashboard()
  {:noreply, state}
end
```

3. **Process Monitoring**
```elixir
def handle_info(
  {:DOWN, ref, :process, _pid, reason},
  %{running: running} = state
) do
  case find_issue_id_for_ref(running, ref) do
    nil ->
      {:noreply, state}

    issue_id ->
      {running_entry, state} = pop_running_entry(state, issue_id)
      session_id = running_entry_session_id(running_entry)

      state =
        case reason do
          :normal ->
            Logger.info("Agent task completed for issue_id=#{issue_id} session_id=#{session_id}")
            state |> complete_issue(issue_id) |> schedule_issue_retry(issue_id, 1, ...)

          _ ->
            Logger.warning("Agent task exited for issue_id=#{issue_id} session_id=#{session_id} reason=#{inspect(reason)}")
            next_attempt = next_retry_attempt_from_running(running_entry)
            schedule_issue_retry(state, issue_id, next_attempt, ...)
        end

      notify_dashboard()
      {:noreply, state}
  end
end
```

### Generic Task GenServer Template
```elixir
defmodule MyApp.TaskProcessor do
  use GenServer
  require Logger

  # Client API
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  def add_task(server, task_id, task_data) do
    GenServer.cast(server, {:add_task, task_id, task_data})
  end

  def get_state(server) do
    GenServer.call(server, :get_state, 5_000)
  end

  # Server Callbacks
  @impl true
  def init(_opts) do
    {:ok, %{
      tasks: %{},
      running: MapSet.new(),
      completed: MapSet.new()
    }}
  end

  @impl true
  def handle_cast({:add_task, task_id, task_data}, state) do
    new_state = %{state | tasks: Map.put(state.tasks, task_id, task_data)}
    {:noreply, new_state}
  end

  @impl true
  def handle_call(:get_state, _from, state) do
    {:reply, state, state}
  end

  @impl true
  def handle_info({:DOWN, ref, :process, pid, reason}, state) do
    Logger.info("Process down: #{inspect(ref)}, reason: #{inspect(reason)}")
    {:noreply, state}
  end
end
```

### Accessing GenServer State from Controllers
```elixir
# In controller
def status(conn, _params) do
  state = MyApp.TaskProcessor.get_state(MyApp.TaskProcessor)
  json(conn, %{
    total_tasks: map_size(state.tasks),
    running: MapSet.size(state.running),
    completed: MapSet.size(state.completed)
  })
end
```

---

## 4. DynamoDB Adapter Patterns in Elixir

### ExAws Configuration

**File:** `mix.exs` dependencies:
```elixir
defp deps do
  [
    {:ex_aws, "~> 2.0"},
    {:ex_aws_dynamodb, "~> 4.0"},
    {:httpoison, "~> 2.0"},
    {:jason, "~> 1.4"}
  ]
end
```

**Config** (`config/config.exs`):
```elixir
config :ex_aws,
  access_key_id: {:system, "AWS_ACCESS_KEY_ID"},
  secret_access_key: {:system, "AWS_SECRET_ACCESS_KEY"},
  region: "us-east-1"

config :ex_aws, :dynamodb,
  scheme: "https://",
  host: "dynamodb.us-east-1.amazonaws.com",
  port: 443,
  region: "us-east-1"
```

### Adapter Pattern from Symphony (Linear/Jira adapters)

Symphony uses behavior modules with runtime module injection - great pattern for DynamoDB adapters:

```elixir
defmodule MyApp.Tracker do
  @doc "Callback to fetch items from tracker"
  @callback fetch_items() :: {:ok, [term()]} | {:error, term()}

  @callback create_item(String.t(), String.t()) :: :ok | {:error, term()}
end

defmodule MyApp.DynamodbAdapter do
  @behaviour MyApp.Tracker

  @spec fetch_items() :: {:ok, [term()]} | {:error, term()}
  def fetch_items do
    with {:ok, response} <- dynamodb_request(:scan_items) do
      {:ok, parse_items(response)}
    else
      {:error, reason} -> {:error, reason}
    end
  end

  @spec create_item(String.t(), String.t()) :: :ok | {:error, term()}
  def create_item(id, data) when is_binary(id) and is_binary(data) do
    with {:ok, _response} <- dynamodb_request(:put_item, %{id: id, data: data}),
         true <- item_created? do
      :ok
    else
      {:error, reason} -> {:error, reason}
      false -> {:error, :item_creation_failed}
      _ -> {:error, :item_creation_failed}
    end
  end

  defp dynamodb_request(operation, params \\ %{}) do
    ExAws.Dynamodb.get_item("my-table", params)
    |> ExAws.request()
  end
end
```

### Core DynamoDB Operations with ExAws

```elixir
# Scan all items
ExAws.Dynamodb.scan("table-name")
|> ExAws.request()
# Returns: {:ok, %{"Items" => [...]}}

# Get item
ExAws.Dynamodb.get_item("table-name", %{"id" => "123"})
|> ExAws.request()
# Returns: {:ok, %{"Item" => %{...}}}

# Put item (create/overwrite)
ExAws.Dynamodb.put_item("table-name", %{
  "id" => "task-1",
  "title" => "My Task",
  "status" => "pending",
  "created_at" => DateTime.utc_now() |> DateTime.to_iso8601()
})
|> ExAws.request()

# Update item (partial update)
ExAws.Dynamodb.update_item("table-name",
  %{"id" => "task-1"},
  [
    update_expression: "SET #status = :status, #updated_at = :updated_at",
    expression_attribute_names: %{
      "#status" => "status",
      "#updated_at" => "updated_at"
    },
    expression_attribute_values: %{
      ":status" => "completed",
      ":updated_at" => DateTime.utc_now() |> DateTime.to_iso8601()
    }
  ]
)
|> ExAws.request()

# Delete item
ExAws.Dynamodb.delete_item("table-name", %{"id" => "task-1"})
|> ExAws.request()

# Query with conditions
ExAws.Dynamodb.query("table-name",
  expression_attribute_names: %{"#status" => "status"},
  expression_attribute_values: %{":status" => "pending"},
  key_condition_expression: "#status = :status"
)
|> ExAws.request()
```

### DynamoDB Context Module Pattern
```elixir
defmodule MyApp.Tasks do
  @table_name "tasks"

  def list_all_tasks do
    with {:ok, response} <- ExAws.Dynamodb.scan(@table_name) |> ExAws.request() do
      items = response["Items"] || []
      {:ok, Enum.map(items, &decode_item/1)}
    else
      {:error, reason} -> {:error, reason}
    end
  end

  def get_task(task_id) do
    with {:ok, response} <- ExAws.Dynamodb.get_item(@table_name, %{"id" => task_id}) |> ExAws.request() do
      case response["Item"] do
        nil -> {:error, :not_found}
        item -> {:ok, decode_item(item)}
      end
    else
      {:error, reason} -> {:error, reason}
    end
  end

  def create_task(attrs) do
    task_id = UUID.uuid4()
    now = DateTime.utc_now() |> DateTime.to_iso8601()

    item = %{
      "id" => task_id,
      "title" => attrs["title"],
      "description" => attrs["description"],
      "status" => "pending",
      "created_at" => now,
      "updated_at" => now
    }

    with {:ok, _response} <- ExAws.Dynamodb.put_item(@table_name, item) |> ExAws.request() do
      {:ok, decode_item(item)}
    else
      {:error, reason} -> {:error, reason}
    end
  end

  def update_task(task_id, attrs) do
    updates = attrs
      |> Enum.map(fn {key, value} -> {"##{key}", key, value} end)

    update_expr = updates
      |> Enum.map(fn {name_key, _key, _val} -> "#{name_key} = :#{name_key}" end)
      |> Enum.join(", ")
      |> (&("SET #{&1}, updated_at = :updated_at")).()

    names = updates
      |> Enum.map(fn {name_key, key, _val} -> {name_key, key} end)
      |> Enum.into(%{"#updated_at" => "updated_at"})

    values = updates
      |> Enum.map(fn {name_key, _key, val} -> {":#{name_key}", val} end)
      |> Enum.into(%{":updated_at" => DateTime.utc_now() |> DateTime.to_iso8601()})

    with {:ok, response} <- ExAws.Dynamodb.update_item(@table_name,
      %{"id" => task_id},
      [
        update_expression: update_expr,
        expression_attribute_names: names,
        expression_attribute_values: values
      ]
    ) |> ExAws.request() do
      {:ok, decode_item(response["Attributes"])}
    else
      {:error, reason} -> {:error, reason}
    end
  end

  def delete_task(task_id) do
    ExAws.Dynamodb.delete_item(@table_name, %{"id" => task_id})
    |> ExAws.request()
    |> case do
      {:ok, _response} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp decode_item(item) do
    # DynamoDB returns typed attributes, convert to plain map
    Map.new(item, fn {key, value} -> {key, value} end)
  end
end
```

---

## 5. Error Handling and Validation

### Phoenix Standard Error Pattern (from Context7)

**FallbackController Pattern:**
```elixir
# lib/my_app_web/controllers/fallback_controller.ex
defmodule MyAppWeb.FallbackController do
  use Phoenix.Controller

  def call(conn, {:error, :not_found}) do
    conn
    |> put_status(:not_found)
    |> put_view(json: MyAppWeb.ErrorJSON)
    |> render(:not_found)
  end

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    conn
    |> put_status(:unprocessable_entity)
    |> put_view(json: MyAppWeb.ErrorJSON)
    |> render(:error, changeset: changeset)
  end

  def call(conn, {:error, :unauthorized}) do
    conn
    |> put_status(:unauthorized)
    |> put_view(json: MyAppWeb.ErrorJSON)
    |> render(:unauthorized)
  end
end

# lib/my_app_web/controllers/task_controller.ex
defmodule MyAppWeb.TaskController do
  use Phoenix.Controller
  action_fallback MyAppWeb.FallbackController

  def show(conn, %{"id" => id}) do
    with {:ok, task} <- MyApp.Tasks.get_task(id) do
      render(conn, :show, task: task)
    end
    # Error automatically handled by FallbackController
  end
end
```

### Symphony's Error Response Pattern (Production)
```elixir
defp error_response(conn, status, code, message) do
  conn
  |> put_status(status)
  |> json(%{error: %{code: code, message: message}})
end

# Usage
def issue(conn, %{"issue_identifier" => issue_identifier}) do
  case Presenter.issue_payload(issue_identifier, orchestrator(), snapshot_timeout_ms()) do
    {:ok, payload} ->
      json(conn, payload)

    {:error, :issue_not_found} ->
      error_response(conn, 404, "issue_not_found", "Issue not found")
  end
end

def refresh(conn, _params) do
  case Presenter.refresh_payload(orchestrator()) do
    {:ok, payload} ->
      conn |> put_status(202) |> json(payload)

    {:error, :unavailable} ->
      error_response(conn, 503, "orchestrator_unavailable", "Orchestrator is unavailable")
  end
end
```

### Validation Pattern
```elixir
defmodule MyApp.Tasks do
  import Ecto.Changeset

  def create_task(attrs) do
    changeset = %Task{}
      |> cast(attrs, [:title, :description, :status])
      |> validate_required([:title, :status])
      |> validate_inclusion(:status, ["pending", "in_progress", "completed"])
      |> validate_length(:title, min: 1, max: 255)

    case Repo.insert(changeset) do
      {:ok, task} -> {:ok, task}
      {:error, changeset} -> {:error, changeset}
    end
  end
end
```

### Error Response JSON Format
```json
{
  "error": {
    "code": "validation_failed",
    "message": "Task creation failed",
    "details": {
      "title": ["can't be blank"],
      "status": ["is invalid"]
    }
  }
}
```

---

## 6. Testing Strategies for Phoenix APIs

### Test Setup Pattern from Symphony

**File:** `/test/support/test_support.exs`

```elixir
defmodule SymphonyElixir.TestSupport do
  defmacro __using__(_opts) do
    quote do
      use ExUnit.Case
      import ExUnit.CaptureLog

      alias SymphonyElixir.Orchestrator
      # ... more aliases

      setup do
        # Cleanup
        on_exit(fn ->
          Application.delete_env(:symphony_elixir, :workflow_file_path)
          File.rm_rf(workflow_root)
        end)

        :ok
      end
    end
  end
end
```

### Phoenix ConnCase Testing Pattern (from Context7)

```elixir
defmodule MyAppWeb.TaskControllerTest do
  use MyAppWeb.ConnCase

  describe "index" do
    test "lists all tasks", %{conn: conn} do
      # Create test data
      {:ok, task} = MyApp.Tasks.create_task(%{title: "Test", status: "pending"})

      # Make request
      conn = get(conn, ~p"/api/tasks")

      # Assert response
      assert json_response(conn, 200)["data"] != []
      assert Enum.any?(json_response(conn, 200)["data"], &(&1["id"] == task.id))
    end
  end

  describe "show" do
    test "returns a task by id", %{conn: conn} do
      {:ok, task} = MyApp.Tasks.create_task(%{title: "Test", status: "pending"})

      conn = get(conn, ~p"/api/tasks/#{task.id}")

      assert json_response(conn, 200)["data"]["id"] == task.id
      assert json_response(conn, 200)["data"]["title"] == "Test"
    end

    test "returns 404 for non-existent task", %{conn: conn} do
      conn = get(conn, ~p"/api/tasks/nonexistent")
      assert response(conn, 404)
    end
  end

  describe "create" do
    test "creates a task with valid data", %{conn: conn} do
      conn = post(conn, ~p"/api/tasks",
        task: %{title: "New Task", status: "pending"}
      )

      assert json_response(conn, 201)["data"]["title"] == "New Task"
    end

    test "returns 422 with invalid data", %{conn: conn} do
      conn = post(conn, ~p"/api/tasks",
        task: %{title: "", status: "invalid"}
      )

      assert json_response(conn, 422)["errors"] != nil
    end
  end

  describe "update" do
    test "updates a task", %{conn: conn} do
      {:ok, task} = MyApp.Tasks.create_task(%{title: "Original", status: "pending"})

      conn = patch(conn, ~p"/api/tasks/#{task.id}",
        task: %{status: "completed"}
      )

      assert json_response(conn, 200)["data"]["status"] == "completed"
    end
  end

  describe "delete" do
    test "deletes a task", %{conn: conn} do
      {:ok, task} = MyApp.Tasks.create_task(%{title: "To Delete", status: "pending"})

      conn = delete(conn, ~p"/api/tasks/#{task.id}")

      assert response(conn, 204)
      assert {:error, :not_found} = MyApp.Tasks.get_task(task.id)
    end
  end
end
```

### GenServer Testing Pattern

```elixir
defmodule MyApp.TaskProcessorTest do
  use ExUnit.Case

  setup do
    {:ok, pid} = MyApp.TaskProcessor.start_link(name: :test_processor)
    {:ok, pid: pid}
  end

  test "adds and retrieves tasks", %{pid: pid} do
    MyApp.TaskProcessor.add_task(pid, "task-1", %{title: "Test"})

    state = MyApp.TaskProcessor.get_state(pid)
    assert state.tasks["task-1"] == %{title: "Test"}
  end

  test "tracks running tasks", %{pid: pid} do
    MyApp.TaskProcessor.start_task(pid, "task-1")

    state = MyApp.TaskProcessor.get_state(pid)
    assert MapSet.member?(state.running, "task-1")
  end
end
```

### HTTP Testing Utilities

```elixir
# Test helpers for common patterns
defmodule MyAppWeb.ApiTestHelpers do
  import Phoenix.ConnTest

  def create_authenticated_conn(user) do
    build_conn()
    |> put_session(:user_id, user.id)
  end

  def assert_error_response(conn, status, code) do
    assert json_response(conn, status)["error"]["code"] == code
    conn
  end

  def assert_has_required_fields(json, required_fields) do
    Enum.each(required_fields, fn field ->
      assert Map.has_key?(json, field), "Missing required field: #{field}"
    end)
  end
end
```

### Coverage Configuration

From Symphony's `mix.exs`:
```elixir
test_coverage: [
  summary: [
    threshold: 100  # Enforce 100% coverage
  ],
  ignore_modules: [
    # Exclude infrastructure/integration modules
    SymphonyElixir.Orchestrator,
    SymphonyElixir.CLI,
    SymphonyElixirWeb.Router
  ]
]
```

---

## 7. Integrating Everything: Task API with GenServer State + DynamoDB

### Complete Example: Task Management API

**Router** (`lib/my_app_web/router.ex`):
```elixir
scope "/api", MyAppWeb do
  pipe_through :api
  resources "/tasks", TaskController, except: [:new, :edit]
  get "/tasks/:id/stream", TaskController, :stream
end
```

**Controller** (`lib/my_app_web/controllers/task_controller.ex`):
```elixir
defmodule MyAppWeb.TaskController do
  use Phoenix.Controller, formats: [:json]
  action_fallback MyAppWeb.FallbackController

  alias MyApp.Tasks
  alias MyApp.TaskOrchestrator

  def index(conn, _params) do
    {:ok, tasks} = Tasks.list_all_tasks()
    render(conn, :index, tasks: tasks)
  end

  def show(conn, %{"id" => id}) do
    {:ok, task} = Tasks.get_task(id)
    render(conn, :show, task: task)
  end

  def create(conn, %{"task" => task_params}) do
    with {:ok, task} <- Tasks.create_task(task_params),
         :ok <- TaskOrchestrator.queue_task(task.id, task) do
      conn
      |> put_status(:created)
      |> render(:show, task: task)
    end
  end

  def update(conn, %{"id" => id, "task" => task_params}) do
    {:ok, task} = Tasks.update_task(id, task_params)
    render(conn, :show, task: task)
  end

  def delete(conn, %{"id" => id}) do
    :ok = Tasks.delete_task(id)
    :ok = TaskOrchestrator.cancel_task(id)
    send_resp(conn, :no_content, "")
  end

  def stream(conn, %{"id" => task_id}) do
    conn
    |> put_resp_header("content-type", "text/event-stream")
    |> put_resp_header("cache-control", "no-cache")
    |> send_chunked(200)
    |> stream_task_updates(task_id)
  end

  defp stream_task_updates(conn, task_id) do
    stream_loop(conn, task_id, 0)
  end

  defp stream_loop(conn, task_id, count) when count > 100 do
    chunk(conn, "event: complete\ndata: {}\n\n")
  end

  defp stream_loop(conn, task_id, count) do
    case chunk(conn, "data: #{Jason.encode!(%{status: "processing", progress: count})}\n\n") do
      {:ok, conn} ->
        Process.sleep(1000)
        stream_loop(conn, task_id, count + 1)
      {:error, _} -> conn
    end
  end
end
```

**GenServer Orchestrator** (`lib/my_app/task_orchestrator.ex`):
```elixir
defmodule MyApp.TaskOrchestrator do
  use GenServer
  require Logger

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def queue_task(task_id, task_data) do
    GenServer.cast(__MODULE__, {:queue_task, task_id, task_data})
  end

  def cancel_task(task_id) do
    GenServer.cast(__MODULE__, {:cancel_task, task_id})
  end

  def get_status do
    GenServer.call(__MODULE__, :get_status, 5_000)
  end

  @impl true
  def init(_opts) do
    schedule_next_poll()
    {:ok, %{
      queued: MapSet.new(),
      running: MapSet.new(),
      completed: MapSet.new(),
      failed: MapSet.new()
    }}
  end

  @impl true
  def handle_cast({:queue_task, task_id, task_data}, state) do
    Logger.info("Queueing task: #{task_id}")
    {:noreply, %{state | queued: MapSet.put(state.queued, task_id)}}
  end

  @impl true
  def handle_cast({:cancel_task, task_id}, state) do
    Logger.info("Cancelling task: #{task_id}")
    {:noreply, %{
      state
      | queued: MapSet.delete(state.queued, task_id),
        running: MapSet.delete(state.running, task_id)
    }}
  end

  @impl true
  def handle_call(:get_status, _from, state) do
    {:reply, state, state}
  end

  @impl true
  def handle_info(:poll, state) do
    new_state = process_queued_tasks(state)
    schedule_next_poll()
    {:noreply, new_state}
  end

  defp process_queued_tasks(state) do
    state.queued
    |> Enum.take(5)  # Process up to 5 at a time
    |> Enum.reduce(state, fn task_id, acc ->
      %{
        acc
        | queued: MapSet.delete(acc.queued, task_id),
          running: MapSet.put(acc.running, task_id)
      }
    end)
  end

  defp schedule_next_poll do
    Process.send_after(self(), :poll, 5_000)
  end
end
```

**DynamoDB Context** (`lib/my_app/tasks.ex`):
```elixir
defmodule MyApp.Tasks do
  @table_name "tasks"

  def list_all_tasks do
    with {:ok, response} <- ExAws.Dynamodb.scan(@table_name) |> ExAws.request() do
      items = response["Items"] || []
      {:ok, Enum.map(items, &decode_item/1)}
    end
  end

  def get_task(task_id) do
    with {:ok, response} <-
      ExAws.Dynamodb.get_item(@table_name, %{"id" => task_id}) |> ExAws.request() do
      case response["Item"] do
        nil -> {:error, :not_found}
        item -> {:ok, decode_item(item)}
      end
    end
  end

  def create_task(attrs) do
    task_id = UUID.uuid4()
    now = DateTime.utc_now() |> DateTime.to_iso8601()

    item = %{
      "id" => task_id,
      "title" => attrs["title"],
      "description" => attrs["description"],
      "status" => "pending",
      "created_at" => now,
      "updated_at" => now
    }

    with {:ok, _} <- ExAws.Dynamodb.put_item(@table_name, item) |> ExAws.request() do
      {:ok, decode_item(item)}
    end
  end

  def update_task(id, attrs) do
    now = DateTime.utc_now() |> DateTime.to_iso8601()

    update_expr = "SET updated_at = :updated_at"
    values = %{":updated_at" => now}

    names = %{}

    Enum.reduce(attrs, {update_expr, names, values}, fn {key, val}, {expr, ns, vs} ->
      {
        expr <> ", ##{key} = :#{key}",
        Map.put(ns, "##{key}", key),
        Map.put(vs, ":#{key}", val)
      }
    end)
    |> then(fn {expr, ns, vs} ->
      ExAws.Dynamodb.update_item(@table_name,
        %{"id" => id},
        [
          update_expression: expr,
          expression_attribute_names: ns,
          expression_attribute_values: vs,
          return_values: "ALL_NEW"
        ]
      )
      |> ExAws.request()
    end)
    |> case do
      {:ok, response} -> {:ok, decode_item(response["Attributes"])}
      {:error, reason} -> {:error, reason}
    end
  end

  def delete_task(task_id) do
    ExAws.Dynamodb.delete_item(@table_name, %{"id" => task_id})
    |> ExAws.request()
    |> case do
      {:ok, _} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp decode_item(item) do
    Map.new(item, fn {key, value} -> {key, value} end)
  end
end
```

---

## Summary: Key Principles

### From Official Documentation
1. **Router**: Use `resources/2` for standard CRUD, exclude `:new` and `:edit` for APIs
2. **Controllers**: Pattern match parameters, use `with` for error handling
3. **GenServer**: Implement `init/1`, `handle_cast/2`, `handle_call/3`, `handle_info/2`
4. **Testing**: Use `ConnCase` for integration tests, mock GenServers in unit tests

### From Symphony Production Code
1. **Error Responses**: Consistent format with `code` and `message` fields
2. **Monitoring**: Track processes with `:DOWN` messages and maintain state maps
3. **Polling**: Use tick-based pattern with `schedule_next_poll()`
4. **Configuration**: Runtime injection via `Application.get_env/2`

### Best Practices
1. **Behavior modules**: Use `@behaviour` for pluggable implementations (adapters)
2. **Context modules**: Business logic separate from controllers
3. **Supervision tree**: GenServers managed by Supervisor with proper restart strategies
4. **Error codes**: Use specific error codes for client error handling
5. **Type specs**: Use `@spec` for all public functions

