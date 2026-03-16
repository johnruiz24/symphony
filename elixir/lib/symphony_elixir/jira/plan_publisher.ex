defmodule SymphonyElixir.Jira.PlanPublisher do
  @moduledoc """
  Publishes plan checklist items as Jira issues for PoC workflow validation.
  """

  alias SymphonyElixir.Jira.Client

  @type publish_item :: %{summary: String.t(), description: String.t(), fingerprint: String.t()}

  @spec publish_plan(Path.t(), keyword()) :: {:ok, [String.t()]} | {:error, term()}
  def publish_plan(plan_path, opts \\ []) when is_binary(plan_path) and is_list(opts) do
    jira_client = Keyword.get(opts, :jira_client, Client)
    parent_issue = Keyword.get(opts, :parent_issue)
    labels = Keyword.get(opts, :labels, ["symphony-poc"])
    limit = Keyword.get(opts, :limit, 10)

    with {:ok, markdown} <- File.read(plan_path) do
      plan_path
      |> extract_publish_items(markdown)
      |> Enum.take(limit)
      |> Enum.reduce_while({:ok, []}, fn item, {:ok, created} ->
        description = build_issue_description(item, plan_path, parent_issue)

        case jira_client.create_issue(item.summary, description, labels: labels) do
          {:ok, issue_key} ->
            {:cont, {:ok, [issue_key | created]}}

          {:error, reason} ->
            {:halt, {:error, {:jira_issue_create_failed, item.summary, reason}}}
        end
      end)
      |> case do
        {:ok, created_issue_keys} ->
          {:ok, Enum.reverse(created_issue_keys)}

        {:error, _reason} = error ->
          error
      end
    end
  end

  @spec extract_publish_items(Path.t(), String.t()) :: [publish_item()]
  def extract_publish_items(plan_path, markdown) when is_binary(plan_path) and is_binary(markdown) do
    markdown
    |> String.split("\n")
    |> Enum.filter(&checklist_line?/1)
    |> Enum.map(&checklist_summary/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq()
    |> Enum.map(fn summary ->
      %{
        summary: "[Symphony PoC] #{summary}",
        description: "Generated from validated plan checklist item.",
        fingerprint: fingerprint(plan_path, summary)
      }
    end)
  end

  defp checklist_line?(line) when is_binary(line) do
    Regex.match?(~r/^\s*-\s+\[(x|X)\]\s+.+$/, line)
  end

  defp checklist_summary(line) when is_binary(line) do
    case Regex.run(~r/^\s*-\s+\[(x|X)\]\s+(.+)$/, line, capture: :all_but_first) do
      [_checked, summary] -> String.trim(summary)
      _ -> nil
    end
  end

  defp fingerprint(plan_path, summary) do
    :sha256
    |> :crypto.hash("#{plan_path}:#{summary}")
    |> Base.encode16(case: :lower)
    |> binary_part(0, 16)
  end

  defp build_issue_description(item, plan_path, nil) do
    """
    #{item.description}

    Source plan: #{plan_path}
    Fingerprint: #{item.fingerprint}
    """
    |> String.trim()
  end

  defp build_issue_description(item, plan_path, parent_issue) do
    """
    #{item.description}

    Source plan: #{plan_path}
    Parent issue: #{parent_issue}
    Fingerprint: #{item.fingerprint}
    """
    |> String.trim()
  end
end
