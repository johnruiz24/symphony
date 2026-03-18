defmodule SymphonyElixirWeb.AgentController do
  @moduledoc """
  API controller for agent state and workload information.
  Reads state from the Orchestrator GenServer (read-only snapshot).
  """

  use Phoenix.Controller, formats: [:json]

  alias Plug.Conn
  alias SymphonyElixir.Orchestrator
  alias SymphonyElixirWeb.{Endpoint, TaskPresenter}

  @spec index(Conn.t(), map()) :: Conn.t()
  def index(conn, _params) do
    case Orchestrator.snapshot(orchestrator(), snapshot_timeout_ms()) do
      %{running: running, retrying: retrying} ->
        json(conn, TaskPresenter.agents_payload(running, retrying))

      :timeout ->
        error_response(conn, 503, "orchestrator_timeout", "Orchestrator snapshot timed out")

      :unavailable ->
        error_response(conn, 503, "orchestrator_unavailable", "Orchestrator is not running")
    end
  end

  defp orchestrator do
    Endpoint.config(:orchestrator) || Orchestrator
  end

  defp snapshot_timeout_ms do
    Endpoint.config(:snapshot_timeout_ms) || 15_000
  end

  defp error_response(conn, status, code, message) do
    conn
    |> put_status(status)
    |> json(%{error: %{code: code, message: message}})
  end
end
