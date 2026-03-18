defmodule SymphonyElixir.TaskStore do
  @moduledoc """
  Adapter boundary for task persistence (DynamoDB in production, memory for dev/test).
  """

  @type task :: %{
          id: String.t(),
          title: String.t(),
          description: String.t() | nil,
          status: String.t(),
          priority: String.t(),
          assigned_agent: String.t() | nil,
          tags: [String.t()],
          source: String.t(),
          version: non_neg_integer(),
          created_at: String.t(),
          updated_at: String.t()
        }

  @type filter_opts :: %{
          optional(:status) => String.t(),
          optional(:priority) => String.t(),
          optional(:assigned_agent) => String.t()
        }

  @callback list_tasks(filter_opts()) :: {:ok, [task()]} | {:error, term()}
  @callback get_task(String.t()) :: {:ok, task()} | {:error, :not_found} | {:error, term()}
  @callback create_task(map()) :: {:ok, task()} | {:error, term()}
  @callback update_task(String.t(), map()) :: {:ok, task()} | {:error, :not_found} | {:error, term()}
  @callback delete_task(String.t()) :: :ok | {:error, :not_found} | {:error, term()}

  @spec list_tasks(filter_opts()) :: {:ok, [task()]} | {:error, term()}
  def list_tasks(filters \\ %{}) do
    adapter().list_tasks(filters)
  end

  @spec get_task(String.t()) :: {:ok, task()} | {:error, :not_found} | {:error, term()}
  def get_task(task_id) do
    adapter().get_task(task_id)
  end

  @spec create_task(map()) :: {:ok, task()} | {:error, term()}
  def create_task(attrs) do
    adapter().create_task(attrs)
  end

  @spec update_task(String.t(), map()) :: {:ok, task()} | {:error, :not_found} | {:error, term()}
  def update_task(task_id, attrs) do
    adapter().update_task(task_id, attrs)
  end

  @spec delete_task(String.t()) :: :ok | {:error, :not_found} | {:error, term()}
  def delete_task(task_id) do
    adapter().delete_task(task_id)
  end

  @spec adapter() :: module()
  def adapter do
    Application.get_env(:symphony_elixir, :task_store_adapter, SymphonyElixir.TaskStore.Memory)
  end
end
