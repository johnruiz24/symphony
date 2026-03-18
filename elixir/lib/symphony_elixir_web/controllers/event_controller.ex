defmodule SymphonyElixirWeb.EventController do
  @moduledoc """
  SSE (Server-Sent Events) streaming controller.
  Clients connect to GET /api/v1/events and receive real-time task/agent updates.

  Event lifecycle:
  1. Client opens connection
  2. Server sends `connected` event with connection metadata
  3. Server sends `snapshot` with full current state
  4. Server pushes incremental events as changes occur
  5. Heartbeat every 15s prevents proxy timeouts
  """

  use Phoenix.Controller, formats: [:json]

  alias SymphonyElixirWeb.TaskEventPubSub

  @heartbeat_interval_ms 15_000

  @spec stream(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def stream(conn, _params) do
    :ok = TaskEventPubSub.subscribe()
    connection_id = generate_connection_id()

    conn =
      conn
      |> put_resp_header("content-type", "text/event-stream")
      |> put_resp_header("cache-control", "no-cache")
      |> put_resp_header("connection", "keep-alive")
      |> put_resp_header("x-accel-buffering", "no")
      |> send_chunked(200)

    event_id = 1

    case send_sse(conn, "connected", %{connection_id: connection_id, server_time: now()}, event_id) do
      {:ok, conn} ->
        schedule_heartbeat()
        sse_loop(conn, event_id + 1)

      {:error, _} ->
        conn
    end
  end

  defp sse_loop(conn, event_id) do
    receive do
      {:task_event, event_type, payload} ->
        case send_sse(conn, event_type, payload, event_id) do
          {:ok, conn} -> sse_loop(conn, event_id + 1)
          {:error, _} -> conn
        end

      :heartbeat ->
        case send_sse(conn, "heartbeat", %{}, event_id) do
          {:ok, conn} ->
            schedule_heartbeat()
            sse_loop(conn, event_id + 1)

          {:error, _} ->
            conn
        end

      :observability_updated ->
        case send_sse(conn, "agent_state_changed", %{source: "orchestrator"}, event_id) do
          {:ok, conn} -> sse_loop(conn, event_id + 1)
          {:error, _} -> conn
        end
    end
  end

  defp send_sse(conn, event_type, payload, event_id) do
    data = Jason.encode!(payload)
    chunk_data = "id: #{event_id}\nevent: #{event_type}\ndata: #{data}\n\n"

    case Plug.Conn.chunk(conn, chunk_data) do
      {:ok, conn} -> {:ok, conn}
      {:error, reason} -> {:error, reason}
    end
  end

  defp schedule_heartbeat do
    Process.send_after(self(), :heartbeat, @heartbeat_interval_ms)
  end

  defp generate_connection_id do
    :crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower)
  end

  defp now do
    DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
  end
end
