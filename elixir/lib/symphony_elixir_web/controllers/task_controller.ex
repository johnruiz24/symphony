defmodule SymphonyElixirWeb.TaskController do
  @moduledoc """
  REST API controller for task CRUD and reassignment.
  """

  use Phoenix.Controller, formats: [:json]

  alias Plug.Conn
  alias SymphonyElixir.TaskStore
  alias SymphonyElixirWeb.TaskPresenter

  @valid_statuses ~w(backlog todo in_progress done)
  @valid_priorities ~w(low medium high urgent)

  @spec index(Conn.t(), map()) :: Conn.t()
  def index(conn, params) do
    filters = extract_filters(params)

    case TaskStore.list_tasks(filters) do
      {:ok, tasks} ->
        json(conn, TaskPresenter.tasks_payload(tasks))

      {:error, reason} ->
        error_response(conn, 503, "task_store_error", "Failed to list tasks: #{inspect(reason)}")
    end
  end

  @spec show(Conn.t(), map()) :: Conn.t()
  def show(conn, %{"id" => id}) do
    case TaskStore.get_task(id) do
      {:ok, task} ->
        json(conn, %{data: TaskPresenter.task_payload(task)})

      {:error, :not_found} ->
        error_response(conn, 404, "task_not_found", "Task not found")

      {:error, reason} ->
        error_response(conn, 503, "task_store_error", "Failed to get task: #{inspect(reason)}")
    end
  end

  @spec create(Conn.t(), map()) :: Conn.t()
  def create(conn, params) do
    with :ok <- validate_required(params, ["title"]),
         :ok <- validate_status(params),
         :ok <- validate_priority(params),
         {:ok, task} <- TaskStore.create_task(params) do
      broadcast_event("task_created", TaskPresenter.task_payload(task))

      conn
      |> put_status(:created)
      |> json(%{data: TaskPresenter.task_payload(task)})
    else
      {:error, {:missing_field, field}} ->
        error_response(conn, 422, "validation_error", "Missing required field: #{field}")

      {:error, {:invalid_status, status}} ->
        error_response(conn, 422, "validation_error", "Invalid status: #{status}. Must be one of: #{Enum.join(@valid_statuses, ", ")}")

      {:error, {:invalid_priority, priority}} ->
        error_response(conn, 422, "validation_error", "Invalid priority: #{priority}. Must be one of: #{Enum.join(@valid_priorities, ", ")}")

      {:error, reason} ->
        error_response(conn, 503, "task_store_error", "Failed to create task: #{inspect(reason)}")
    end
  end

  @spec update(Conn.t(), map()) :: Conn.t()
  def update(conn, %{"id" => id} = params) do
    attrs = Map.drop(params, ["id"])

    with :ok <- validate_status(attrs),
         :ok <- validate_priority(attrs),
         {:ok, task} <- TaskStore.update_task(id, attrs) do
      broadcast_event("task_updated", TaskPresenter.task_payload(task))
      json(conn, %{data: TaskPresenter.task_payload(task)})
    else
      {:error, :not_found} ->
        error_response(conn, 404, "task_not_found", "Task not found")

      {:error, {:invalid_status, status}} ->
        error_response(conn, 422, "validation_error", "Invalid status: #{status}")

      {:error, {:invalid_priority, priority}} ->
        error_response(conn, 422, "validation_error", "Invalid priority: #{priority}")

      {:error, reason} ->
        error_response(conn, 503, "task_store_error", "Failed to update task: #{inspect(reason)}")
    end
  end

  @spec delete(Conn.t(), map()) :: Conn.t()
  def delete(conn, %{"id" => id}) do
    case TaskStore.delete_task(id) do
      :ok ->
        broadcast_event("task_deleted", %{id: id})
        send_resp(conn, :no_content, "")

      {:error, :not_found} ->
        error_response(conn, 404, "task_not_found", "Task not found")

      {:error, reason} ->
        error_response(conn, 503, "task_store_error", "Failed to delete task: #{inspect(reason)}")
    end
  end

  @spec reassign(Conn.t(), map()) :: Conn.t()
  def reassign(conn, %{"id" => id} = params) do
    agent_id = Map.get(params, "agent_id")

    if is_nil(agent_id) or agent_id == "" do
      error_response(conn, 422, "validation_error", "Missing required field: agent_id")
    else
      case TaskStore.update_task(id, %{"assigned_agent" => agent_id, "status" => "todo"}) do
        {:ok, task} ->
          broadcast_event("task_reassigned", %{
            task: TaskPresenter.task_payload(task),
            agent_id: agent_id
          })

          json(conn, %{data: TaskPresenter.task_payload(task)})

        {:error, :not_found} ->
          error_response(conn, 404, "task_not_found", "Task not found")

        {:error, reason} ->
          error_response(conn, 503, "task_store_error", "Failed to reassign task: #{inspect(reason)}")
      end
    end
  end

  defp extract_filters(params) do
    %{}
    |> maybe_put_filter(:status, params["status"])
    |> maybe_put_filter(:priority, params["priority"])
    |> maybe_put_filter(:assigned_agent, params["assignee"])
  end

  defp maybe_put_filter(filters, _key, nil), do: filters
  defp maybe_put_filter(filters, _key, ""), do: filters
  defp maybe_put_filter(filters, key, value), do: Map.put(filters, key, value)

  defp validate_required(params, fields) do
    case Enum.find(fields, fn f -> is_nil(params[f]) or params[f] == "" end) do
      nil -> :ok
      field -> {:error, {:missing_field, field}}
    end
  end

  defp validate_status(%{"status" => status}) when status not in @valid_statuses,
    do: {:error, {:invalid_status, status}}

  defp validate_status(_), do: :ok

  defp validate_priority(%{"priority" => priority}) when priority not in @valid_priorities,
    do: {:error, {:invalid_priority, priority}}

  defp validate_priority(_), do: :ok

  defp broadcast_event(event_type, payload) do
    SymphonyElixirWeb.TaskEventPubSub.broadcast_event(event_type, payload)
  end

  defp error_response(conn, status, code, message) do
    conn
    |> put_status(status)
    |> json(%{error: %{code: code, message: message}})
  end
end
