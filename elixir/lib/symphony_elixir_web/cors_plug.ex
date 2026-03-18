defmodule SymphonyElixirWeb.CorsPlug do
  @moduledoc """
  Simple CORS plug for cross-origin requests from React frontend (port 3000).
  """

  import Plug.Conn

  @behaviour Plug

  @impl true
  def init(opts), do: opts

  @impl true
  def call(%{method: "OPTIONS"} = conn, _opts) do
    conn
    |> put_cors_headers()
    |> send_resp(204, "")
    |> halt()
  end

  def call(conn, _opts) do
    put_cors_headers(conn)
  end

  defp put_cors_headers(conn) do
    conn
    |> put_resp_header("access-control-allow-origin", allowed_origin())
    |> put_resp_header("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS")
    |> put_resp_header("access-control-allow-headers", "content-type, authorization")
    |> put_resp_header("access-control-max-age", "3600")
  end

  defp allowed_origin do
    Application.get_env(:symphony_elixir, :cors_origin, "http://localhost:3000")
  end
end
