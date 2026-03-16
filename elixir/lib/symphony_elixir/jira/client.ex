defmodule SymphonyElixir.Jira.Client do
  @moduledoc """
  Thin Jira REST client used by tracker and PoC publishing flows.
  """

  require Logger

  alias SymphonyElixir.Config
  alias SymphonyElixir.Linear.Issue

  @search_path "/rest/api/3/search/jql"

  @type request_result :: {:ok, map()} | {:error, term()}

  @spec fetch_candidate_issues() :: {:ok, [Issue.t()]} | {:error, term()}
  def fetch_candidate_issues do
    tracker = Config.settings!().tracker

    with {:ok, _jira_settings} <- jira_settings(),
         {:ok, body} <- search_issues(project_status_jql(tracker.project_slug, tracker.active_states)),
         {:ok, issues} <- decode_search_response(body) do
      {:ok, issues}
    end
  end

  @spec fetch_issues_by_states([String.t()]) :: {:ok, [Issue.t()]} | {:error, term()}
  def fetch_issues_by_states(state_names) do
    tracker = Config.settings!().tracker
    normalized_states = Enum.map(state_names, &to_string/1) |> Enum.reject(&(&1 == "")) |> Enum.uniq()

    case normalized_states do
      [] ->
        {:ok, []}

      _ ->
        with {:ok, _jira_settings} <- jira_settings(),
             {:ok, body} <- search_issues(project_status_jql(tracker.project_slug, normalized_states)),
             {:ok, issues} <- decode_search_response(body) do
          {:ok, issues}
        end
    end
  end

  @spec fetch_issue_states_by_ids([String.t()]) :: {:ok, [Issue.t()]} | {:error, term()}
  def fetch_issue_states_by_ids(issue_ids) do
    ids = Enum.uniq(issue_ids)

    case ids do
      [] ->
        {:ok, []}

      _ ->
        with {:ok, _jira_settings} <- jira_settings(),
             {:ok, body} <- search_issues(id_jql(ids)),
             {:ok, issues} <- decode_search_response(body) do
          {:ok, issues}
        end
    end
  end

  @spec create_comment(String.t(), String.t()) :: :ok | {:error, term()}
  def create_comment(issue_id, body)
      when is_binary(issue_id) and is_binary(body) do
    with {:ok, _jira_settings} <- jira_settings(),
         {:ok, response} <- request(:post, "/rest/api/3/issue/#{issue_id}/comment", comment_payload(body)),
         true <- match?({:ok, _comment_id}, comment_result(response)) do
      :ok
    else
      false ->
        {:error, :comment_create_failed}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @spec update_issue_state(String.t(), String.t()) :: :ok | {:error, term()}
  def update_issue_state(issue_id, state_name)
      when is_binary(issue_id) and is_binary(state_name) do
    with {:ok, _jira_settings} <- jira_settings(),
         {:ok, transitions_body} <- request(:get, "/rest/api/3/issue/#{issue_id}/transitions", nil),
         {:ok, transition_id} <- find_transition_id(transitions_body, state_name),
         {:ok, _response} <- request(:post, "/rest/api/3/issue/#{issue_id}/transitions", %{"transition" => %{"id" => transition_id}}) do
      :ok
    else
      {:error, reason} -> {:error, reason}
    end
  end

  @spec create_issue(String.t(), String.t(), keyword()) :: {:ok, String.t()} | {:error, term()}
  def create_issue(summary, description, opts \\ [])
      when is_binary(summary) and is_binary(description) and is_list(opts) do
    issue_type = Keyword.get(opts, :issue_type, "Task")
    labels = Keyword.get(opts, :labels, [])

    with {:ok, jira} <- jira_settings(),
         {:ok, response} <-
           request(:post, "/rest/api/3/issue", %{
             "fields" => %{
               "project" => %{"key" => jira.project_key},
               "summary" => summary,
               "description" => text_adf(description),
               "issuetype" => %{"name" => issue_type},
               "labels" => labels
             }
           }),
         issue_key when is_binary(issue_key) <- get_in(response, ["key"]) do
      {:ok, issue_key}
    else
      {:error, reason} -> {:error, reason}
      _ -> {:error, :issue_create_failed}
    end
  end

  @spec search_issues(String.t()) :: request_result()
  def search_issues(jql) when is_binary(jql) do
    payload = %{
      "jql" => jql,
      "fields" => [
        "summary",
        "description",
        "priority",
        "status",
        "labels",
        "assignee",
        "created",
        "updated"
      ],
      "maxResults" => 50
    }

    request(:post, @search_path, payload)
  end

  defp jira_settings do
    tracker = Config.settings!().tracker

    cond do
      tracker.kind != "jira" ->
        {:error, :jira_tracker_not_enabled}

      not is_binary(tracker.endpoint) ->
        {:error, :missing_jira_endpoint}

      not is_binary(tracker.api_key) ->
        {:error, :missing_jira_api_key}

      not is_binary(tracker.project_slug) ->
        {:error, :missing_jira_project_key}

      true ->
        {:ok,
         %{
           base_url: normalize_base_url(tracker.endpoint),
           auth_token: Base.encode64(tracker.api_key),
           project_key: tracker.project_slug
         }}
    end
  end

  defp request(method, path, payload) do
    with {:ok, jira} <- jira_settings() do
      req_opts =
        [
          method: method,
          url: jira.base_url <> path,
          headers: [
            {"authorization", "Basic #{jira.auth_token}"},
            {"accept", "application/json"},
            {"content-type", "application/json"}
          ]
        ]

      req_opts =
        case payload do
          nil -> req_opts
          body -> Keyword.put(req_opts, :json, body)
        end

      case Req.request(req_opts) do
        {:ok, %{status: status, body: body}} when status in 200..299 ->
          {:ok, body}

        {:ok, %{status: status, body: body}} ->
          Logger.error("Jira request failed status=#{status} path=#{path} body=#{inspect(body)}")
          {:error, {:jira_api_status, status}}

        {:error, reason} ->
          {:error, {:jira_api_request, reason}}
      end
    end
  end

  defp decode_search_response(%{"issues" => issues}) when is_list(issues) do
    {:ok, Enum.map(issues, &normalize_issue/1)}
  end

  defp decode_search_response(_body), do: {:error, :jira_invalid_search_payload}

  defp normalize_issue(issue) when is_map(issue) do
    fields = Map.get(issue, "fields", %{})
    created_at = parse_datetime(Map.get(fields, "created"))
    updated_at = parse_datetime(Map.get(fields, "updated"))
    status_name = get_in(fields, ["status", "name"])

    %Issue{
      id: Map.get(issue, "id"),
      identifier: Map.get(issue, "key"),
      title: Map.get(fields, "summary"),
      description: extract_description_text(Map.get(fields, "description")),
      priority: normalize_priority(get_in(fields, ["priority", "id"])),
      state: status_name,
      branch_name: nil,
      url: issue_browse_url(Map.get(issue, "key")),
      assignee_id: get_in(fields, ["assignee", "accountId"]),
      labels: Map.get(fields, "labels", []),
      blocked_by: [],
      assigned_to_worker: true,
      created_at: created_at,
      updated_at: updated_at
    }
  end

  defp project_status_jql(project_key, states) do
    quoted_states = Enum.map(states, &quote_jql/1) |> Enum.join(", ")
    "project = #{quote_jql(project_key)} AND status in (#{quoted_states}) ORDER BY updated DESC"
  end

  defp id_jql(ids) do
    joined = Enum.map(ids, &quote_jql/1) |> Enum.join(", ")
    "id in (#{joined})"
  end

  defp quote_jql(value) when is_binary(value) do
    "\"" <> String.replace(value, "\"", "\\\"") <> "\""
  end

  defp comment_payload(body) when is_binary(body) do
    %{"body" => text_adf(body)}
  end

  defp comment_result(%{"id" => comment_id}) when is_binary(comment_id), do: {:ok, comment_id}
  defp comment_result(_response), do: {:error, :comment_create_failed}

  defp find_transition_id(%{"transitions" => transitions}, state_name) when is_list(transitions) do
    normalized_target = normalize_state_name(state_name)

    transition_id =
      transitions
      |> Enum.find(fn transition ->
        transition
        |> get_in(["to", "name"])
        |> normalize_state_name() == normalized_target
      end)
      |> case do
        %{"id" => id} when is_binary(id) -> id
        _ -> nil
      end

    case transition_id do
      nil -> {:error, :jira_transition_not_found}
      id -> {:ok, id}
    end
  end

  defp find_transition_id(_body, _state_name), do: {:error, :jira_invalid_transition_payload}

  defp normalize_state_name(state_name) when is_binary(state_name) do
    state_name
    |> String.trim()
    |> String.downcase()
  end

  defp normalize_state_name(_state_name), do: ""

  defp text_adf(text) when is_binary(text) do
    %{
      "type" => "doc",
      "version" => 1,
      "content" => [
        %{
          "type" => "paragraph",
          "content" => [
            %{
              "type" => "text",
              "text" => text
            }
          ]
        }
      ]
    }
  end

  defp extract_description_text(nil), do: nil
  defp extract_description_text(description) when is_binary(description), do: description

  defp extract_description_text(%{"content" => content}) when is_list(content) do
    content
    |> Enum.flat_map(&extract_text_nodes/1)
    |> Enum.join(" ")
    |> String.trim()
    |> case do
      "" -> nil
      text -> text
    end
  end

  defp extract_description_text(_description), do: nil

  defp extract_text_nodes(%{"content" => children}) when is_list(children) do
    Enum.flat_map(children, &extract_text_nodes/1)
  end

  defp extract_text_nodes(%{"text" => text}) when is_binary(text), do: [text]
  defp extract_text_nodes(_node), do: []

  defp parse_datetime(value) when is_binary(value) do
    case DateTime.from_iso8601(value) do
      {:ok, datetime, _offset} -> datetime
      _ -> nil
    end
  end

  defp parse_datetime(_value), do: nil

  defp normalize_priority(nil), do: nil

  defp normalize_priority(priority_id) when is_binary(priority_id) do
    case Integer.parse(priority_id) do
      {int, ""} -> int
      _ -> nil
    end
  end

  defp normalize_priority(_priority_id), do: nil

  defp issue_browse_url(nil), do: nil

  defp issue_browse_url(issue_key) when is_binary(issue_key) do
    with {:ok, jira} <- jira_settings() do
      jira.base_url
      |> String.replace_suffix("/rest/api/3", "")
      |> Kernel.<>("/browse/#{issue_key}")
    else
      _ -> nil
    end
  end

  defp normalize_base_url(endpoint) when is_binary(endpoint) do
    endpoint = String.trim_trailing(endpoint, "/")

    if String.ends_with?(endpoint, "/rest/api/3") do
      endpoint
    else
      endpoint <> "/rest/api/3"
    end
  end
end
