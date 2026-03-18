defmodule SymphonyElixirWeb.TaskEventPubSubTest do
  use SymphonyElixir.TestSupport

  alias SymphonyElixirWeb.TaskEventPubSub

  test "subscribe and broadcast_event deliver task events" do
    assert :ok = TaskEventPubSub.subscribe()
    assert :ok = TaskEventPubSub.broadcast_event("task_created", %{id: "t1"})
    assert_receive {:task_event, "task_created", %{id: "t1"}}
  end

  test "broadcast_event is a no-op when pubsub is unavailable" do
    pubsub_child_id = Phoenix.PubSub.Supervisor

    on_exit(fn ->
      if Process.whereis(SymphonyElixir.PubSub) == nil do
        assert {:ok, _pid} =
                 Supervisor.restart_child(SymphonyElixir.Supervisor, pubsub_child_id)
      end
    end)

    assert is_pid(Process.whereis(SymphonyElixir.PubSub))
    assert :ok = Supervisor.terminate_child(SymphonyElixir.Supervisor, pubsub_child_id)
    refute Process.whereis(SymphonyElixir.PubSub)

    assert :ok = TaskEventPubSub.broadcast_event("task_created", %{id: "t1"})
  end

  test "topic returns the expected topic string" do
    assert TaskEventPubSub.topic() == "task:events"
  end
end
