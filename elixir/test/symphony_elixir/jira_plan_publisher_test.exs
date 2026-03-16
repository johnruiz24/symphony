defmodule SymphonyElixir.JiraPlanPublisherTest do
  use ExUnit.Case, async: true

  alias SymphonyElixir.Jira.PlanPublisher

  defmodule FakeJiraClient do
    def create_issue(summary, description, opts) do
      send(self(), {:create_issue_called, summary, description, opts})
      {:ok, "POC-#{:erlang.unique_integer([:positive])}"}
    end
  end

  test "extract_publish_items keeps checked checklist entries only" do
    markdown = """
    # Plan

    - [ ] first unchecked
    - [x] checked one
    - [X] checked two
    """

    items = PlanPublisher.extract_publish_items("docs/plans/example.md", markdown)

    assert length(items) == 2
    assert Enum.any?(items, &String.contains?(&1.summary, "checked one"))
    assert Enum.any?(items, &String.contains?(&1.summary, "checked two"))
    refute Enum.any?(items, &String.contains?(&1.summary, "unchecked"))
  end

  test "publish_plan creates one jira issue per checked item" do
    temp_plan =
      Path.join(System.tmp_dir!(), "jira-plan-publisher-#{System.unique_integer([:positive])}.md")

    File.write!(
      temp_plan,
      """
      # Plan
      - [x] item A
      - [ ] item B
      - [x] item C
      """
    )

    assert {:ok, created} =
             PlanPublisher.publish_plan(
               temp_plan,
               jira_client: FakeJiraClient,
               parent_issue: "POC-1",
               labels: ["symphony-poc"],
               limit: 10
             )

    assert length(created) == 2

    assert_receive {:create_issue_called, summary_a, description_a, opts_a}
    assert summary_a =~ "[Symphony PoC]"
    assert description_a =~ "Parent issue: POC-1"
    assert opts_a[:labels] == ["symphony-poc"]

    assert_receive {:create_issue_called, summary_c, _description_c, _opts_c}
    assert summary_c =~ "[Symphony PoC]"

    File.rm(temp_plan)
  end
end
