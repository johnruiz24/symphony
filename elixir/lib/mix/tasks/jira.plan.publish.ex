defmodule Mix.Tasks.Jira.Plan.Publish do
  use Mix.Task

  alias SymphonyElixir.Jira.PlanPublisher

  @shortdoc "Publish checked plan checklist items as Jira issues (PoC)"

  @moduledoc """
  Publishes checked checklist items from a plan markdown file as Jira issues.

  Usage:

      mix jira.plan.publish --plan docs/plans/2026-03-16-001-example-plan.md
      mix jira.plan.publish --plan docs/plans/2026-03-16-001-example-plan.md --issue PROJ-123
      mix jira.plan.publish --plan docs/plans/2026-03-16-001-example-plan.md --limit 5
  """

  @impl Mix.Task
  def run(args) do
    {opts, _argv, invalid} =
      OptionParser.parse(args,
        strict: [plan: :string, issue: :string, limit: :integer, help: :boolean],
        aliases: [h: :help]
      )

    cond do
      opts[:help] ->
        Mix.shell().info(@moduledoc)

      invalid != [] ->
        Mix.raise("Invalid option(s): #{inspect(invalid)}")

      is_nil(opts[:plan]) ->
        Mix.raise("Missing required --plan <path> argument")

      true ->
        plan_path = Path.expand(opts[:plan])
        parent_issue = opts[:issue]
        limit = opts[:limit] || 10

        case PlanPublisher.publish_plan(plan_path, parent_issue: parent_issue, limit: limit) do
          {:ok, []} ->
            Mix.shell().info("No checked checklist items found to publish.")

          {:ok, created_issue_keys} ->
            Mix.shell().info("Created Jira issues:")
            Enum.each(created_issue_keys, &Mix.shell().info("  - #{&1}"))

          {:error, reason} ->
            Mix.raise("Failed to publish plan items: #{inspect(reason)}")
        end
    end
  end
end
