defmodule SymphonyElixirWeb.TaskPresenter do
  @moduledoc """
  JSON serialization for task and agent API responses.
  """

  @spec task_payload(map()) :: map()
  def task_payload(task) do
    %{
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigned_agent: task.assigned_agent,
      tags: task.tags || [],
      source: Map.get(task, :source, "manual"),
      version: Map.get(task, :version, 1),
      created_at: task.created_at,
      updated_at: task.updated_at
    }
  end

  @spec tasks_payload([map()]) :: map()
  def tasks_payload(tasks) do
    %{
      data: Enum.map(tasks, &task_payload/1),
      meta: %{
        count: length(tasks),
        next_cursor: nil
      }
    }
  end

  @spec agent_payload(map()) :: map()
  def agent_payload(agent) do
    %{
      id: agent.issue_id,
      name: agent.identifier,
      status: agent_status(agent),
      worker_host: agent[:worker_host],
      workload: %{
        active: 1,
        queued: 0,
        completed: 0
      },
      current_task_id: agent.issue_id,
      current_task: %{
        issue_id: agent.issue_id,
        issue_identifier: agent.identifier,
        state: Map.get(agent, :state),
        started_at: iso8601(agent[:started_at]),
        turn_count: Map.get(agent, :turn_count, 0),
        last_event: Map.get(agent, :last_codex_event),
        tokens: %{
          input_tokens: Map.get(agent, :codex_input_tokens, 0),
          output_tokens: Map.get(agent, :codex_output_tokens, 0),
          total_tokens: Map.get(agent, :codex_total_tokens, 0)
        }
      },
      uptime_seconds: Map.get(agent, :runtime_seconds, 0)
    }
  end

  @spec agents_payload([map()], [map()]) :: map()
  def agents_payload(running, retrying) do
    now = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()

    agents =
      Enum.map(running, &agent_payload/1) ++
        Enum.map(retrying, &retrying_agent_payload/1)

    %{
      data: agents,
      meta: %{
        count: length(agents),
        snapshot_at: now
      }
    }
  end

  defp retrying_agent_payload(entry) do
    %{
      id: entry.issue_id,
      name: entry[:identifier],
      status: "retrying",
      worker_host: entry[:worker_host],
      workload: %{
        active: 0,
        queued: 1,
        completed: 0
      },
      current_task_id: nil,
      current_task: nil,
      uptime_seconds: 0,
      retry: %{
        attempt: entry.attempt,
        error: entry[:error]
      }
    }
  end

  defp agent_status(%{state: state}) when is_binary(state) do
    case state do
      "In Progress" -> "working"
      _ -> "working"
    end
  end

  defp agent_status(_), do: "working"

  defp iso8601(%DateTime{} = dt), do: dt |> DateTime.truncate(:second) |> DateTime.to_iso8601()
  defp iso8601(_), do: nil
end
