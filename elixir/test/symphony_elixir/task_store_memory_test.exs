defmodule SymphonyElixir.TaskStore.MemoryTest do
  use SymphonyElixir.TestSupport

  alias SymphonyElixir.TaskStore.Memory

  setup do
    name = :"test_store_#{System.unique_integer([:positive])}"
    {:ok, _pid} = Memory.start_link(name: name)
    Application.put_env(:symphony_elixir, :task_store_memory_name, name)

    on_exit(fn ->
      Application.delete_env(:symphony_elixir, :task_store_memory_name)
    end)

    :ok
  end

  test "create_task returns task with generated id and timestamps" do
    {:ok, task} = Memory.create_task(%{"title" => "Test Task", "description" => "A test"})

    assert is_binary(task.id)
    assert task.title == "Test Task"
    assert task.description == "A test"
    assert task.status == "backlog"
    assert task.priority == "medium"
    assert is_nil(task.assigned_agent)
    assert task.tags == []
    assert is_binary(task.created_at)
    assert is_binary(task.updated_at)
  end

  test "get_task returns task by id" do
    {:ok, created} = Memory.create_task(%{"title" => "Find Me"})
    {:ok, found} = Memory.get_task(created.id)
    assert found.title == "Find Me"
  end

  test "get_task returns error for missing id" do
    assert {:error, :not_found} = Memory.get_task("nonexistent")
  end

  test "list_tasks returns all created tasks" do
    {:ok, _t1} = Memory.create_task(%{"title" => "First"})
    {:ok, _t2} = Memory.create_task(%{"title" => "Second"})
    {:ok, tasks} = Memory.list_tasks()
    assert length(tasks) == 2
    titles = Enum.map(tasks, & &1.title) |> Enum.sort()
    assert titles == ["First", "Second"]
  end

  test "list_tasks filters by status" do
    {:ok, _} = Memory.create_task(%{"title" => "Backlog", "status" => "backlog"})
    {:ok, _} = Memory.create_task(%{"title" => "Done", "status" => "done"})
    {:ok, tasks} = Memory.list_tasks(%{status: "done"})
    assert length(tasks) == 1
    assert hd(tasks).title == "Done"
  end

  test "list_tasks filters by priority" do
    {:ok, _} = Memory.create_task(%{"title" => "Low", "priority" => "low"})
    {:ok, _} = Memory.create_task(%{"title" => "High", "priority" => "high"})
    {:ok, tasks} = Memory.list_tasks(%{priority: "high"})
    assert length(tasks) == 1
    assert hd(tasks).title == "High"
  end

  test "list_tasks filters by assigned_agent" do
    {:ok, _} = Memory.create_task(%{"title" => "Unassigned"})
    {:ok, _} = Memory.create_task(%{"title" => "Assigned", "assigned_agent" => "agent-1"})
    {:ok, tasks} = Memory.list_tasks(%{assigned_agent: "agent-1"})
    assert length(tasks) == 1
    assert hd(tasks).title == "Assigned"
  end

  test "update_task updates fields and bumps updated_at" do
    {:ok, task} = Memory.create_task(%{"title" => "Original"})
    {:ok, updated} = Memory.update_task(task.id, %{"title" => "Updated", "status" => "done"})
    assert updated.title == "Updated"
    assert updated.status == "done"
    assert updated.updated_at >= task.updated_at
  end

  test "update_task returns error for missing id" do
    assert {:error, :not_found} = Memory.update_task("nonexistent", %{"title" => "Nope"})
  end

  test "create_task includes version and source fields" do
    {:ok, task} = Memory.create_task(%{"title" => "Versioned", "source" => "jira"})
    assert task.version == 1
    assert task.source == "jira"
  end

  test "create_task defaults source to manual" do
    {:ok, task} = Memory.create_task(%{"title" => "Manual"})
    assert task.source == "manual"
  end

  test "update_task increments version" do
    {:ok, task} = Memory.create_task(%{"title" => "V1"})
    assert task.version == 1
    {:ok, updated} = Memory.update_task(task.id, %{"title" => "V2"})
    assert updated.version == 2
    {:ok, updated2} = Memory.update_task(task.id, %{"title" => "V3"})
    assert updated2.version == 3
  end

  test "delete_task removes the task" do
    {:ok, task} = Memory.create_task(%{"title" => "To Delete"})
    assert :ok = Memory.delete_task(task.id)
    assert {:error, :not_found} = Memory.get_task(task.id)
  end

  test "delete_task returns error for missing id" do
    assert {:error, :not_found} = Memory.delete_task("nonexistent")
  end

  test "update_task ignores unknown fields without crashing" do
    {:ok, task} = Memory.create_task(%{"title" => "Safe"})
    {:ok, updated} = Memory.update_task(task.id, %{"unknown_field" => "malicious", "title" => "Still Safe"})
    assert updated.title == "Still Safe"
    refute Map.has_key?(updated, :unknown_field)
  end
end
