defmodule SymphonyElixir.TaskStore.Memory do
  @moduledoc """
  In-memory task store using an Agent process. Used for development and testing.
  """

  use Agent

  @behaviour SymphonyElixir.TaskStore

  @mutable_fields ~w(title description status priority assigned_agent tags source)

  @spec start_link(keyword()) :: Agent.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    Agent.start_link(fn -> %{} end, name: name)
  end

  @impl true
  @spec list_tasks(SymphonyElixir.TaskStore.filter_opts()) :: {:ok, [SymphonyElixir.TaskStore.task()]}
  def list_tasks(filters \\ %{}) do
    tasks =
      agent_name()
      |> Agent.get(fn state -> Map.values(state) end)
      |> apply_filters(filters)
      |> Enum.sort_by(& &1.created_at, :desc)

    {:ok, tasks}
  end

  @impl true
  @spec get_task(String.t()) :: {:ok, SymphonyElixir.TaskStore.task()} | {:error, :not_found}
  def get_task(task_id) do
    case Agent.get(agent_name(), fn state -> Map.get(state, task_id) end) do
      nil -> {:error, :not_found}
      task -> {:ok, task}
    end
  end

  @impl true
  @spec create_task(map()) :: {:ok, SymphonyElixir.TaskStore.task()}
  def create_task(attrs) do
    now = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
    task_id = generate_id()

    task = %{
      id: task_id,
      title: Map.get(attrs, "title", ""),
      description: Map.get(attrs, "description"),
      status: Map.get(attrs, "status", "backlog"),
      priority: Map.get(attrs, "priority", "medium"),
      assigned_agent: Map.get(attrs, "assigned_agent"),
      tags: Map.get(attrs, "tags", []),
      source: Map.get(attrs, "source", "manual"),
      version: 1,
      created_at: now,
      updated_at: now
    }

    Agent.update(agent_name(), fn state -> Map.put(state, task_id, task) end)
    {:ok, task}
  end

  @impl true
  @spec update_task(String.t(), map()) :: {:ok, SymphonyElixir.TaskStore.task()} | {:error, :not_found}
  def update_task(task_id, attrs) do
    Agent.get_and_update(agent_name(), fn state ->
      case Map.get(state, task_id) do
        nil ->
          {{:error, :not_found}, state}

        task ->
          now = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()

          updated =
            @mutable_fields
            |> Enum.reduce(task, fn field, acc ->
              case Map.get(attrs, field) do
                nil -> acc
                value -> Map.put(acc, String.to_atom(field), value)
              end
            end)
            |> Map.put(:updated_at, now)
            |> Map.update!(:version, &(&1 + 1))

          {{:ok, updated}, Map.put(state, task_id, updated)}
      end
    end)
  end

  @impl true
  @spec delete_task(String.t()) :: :ok | {:error, :not_found}
  def delete_task(task_id) do
    Agent.get_and_update(agent_name(), fn state ->
      case Map.pop(state, task_id) do
        {nil, state} -> {{:error, :not_found}, state}
        {_task, new_state} -> {:ok, new_state}
      end
    end)
  end

  defp apply_filters(tasks, filters) when map_size(filters) == 0, do: tasks

  defp apply_filters(tasks, filters) do
    Enum.filter(tasks, fn task ->
      matches_filter?(task, :status, filters) and
        matches_filter?(task, :priority, filters) and
        matches_filter?(task, :assigned_agent, filters)
    end)
  end

  defp matches_filter?(task, field, filters) do
    case Map.get(filters, field) do
      nil -> true
      value -> Map.get(task, field) == value
    end
  end

  defp generate_id do
    :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)
  end

  defp agent_name do
    Application.get_env(:symphony_elixir, :task_store_memory_name, __MODULE__)
  end
end
