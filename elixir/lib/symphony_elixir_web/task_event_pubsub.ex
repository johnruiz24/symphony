defmodule SymphonyElixirWeb.TaskEventPubSub do
  @moduledoc """
  PubSub helpers for task and agent event broadcasting.
  Used by SSE endpoint to push real-time updates to React frontend.
  """

  @pubsub SymphonyElixir.PubSub
  @topic "task:events"

  @spec subscribe() :: :ok | {:error, term()}
  def subscribe do
    Phoenix.PubSub.subscribe(@pubsub, @topic)
  end

  @spec broadcast_event(String.t(), map()) :: :ok
  def broadcast_event(event_type, payload) do
    case Process.whereis(@pubsub) do
      pid when is_pid(pid) ->
        Phoenix.PubSub.broadcast(@pubsub, @topic, {:task_event, event_type, payload})

      _ ->
        :ok
    end
  end

  @spec topic() :: String.t()
  def topic, do: @topic
end
