defmodule SymphonyElixirWeb.HealthController do
  @moduledoc """
  Liveness check endpoint. Returns 200 if the Elixir node is up
  and reports Orchestrator GenServer status.
  """

  use Phoenix.Controller, formats: [:json]

  alias Plug.Conn
  alias SymphonyElixir.Orchestrator
  alias SymphonyElixirWeb.Endpoint

  @spec index(Conn.t(), map()) :: Conn.t()
  def index(conn, _params) do
    orchestrator_status =
      case Process.whereis(orchestrator()) do
        pid when is_pid(pid) -> "running"
        _ -> "unavailable"
      end

    json(conn, %{
      status: "ok",
      orchestrator: orchestrator_status,
      timestamp: DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
    })
  end

  defp orchestrator do
    Endpoint.config(:orchestrator) || Orchestrator
  end
end
