# TODO 2026-03-16-001

- status: resolved
- severity: P1
- area: config-validation

## Finding

`tracker.kind: jira` can pass validation while still using the default Linear endpoint if the endpoint field is not explicitly set for Jira mode.

## Why it matters

This creates a misleading "valid config" state and fails later in runtime calls.

## Resolution target

Harden Jira validation to require a Jira-like endpoint and reject the Linear default when `tracker.kind == "jira"`.

## Resolution

- Added `:invalid_jira_endpoint` semantic validation in `Config.validate!/0` path.
- Added regression coverage in `core_test.exs`:
  - rejects Linear endpoint in Jira mode
  - accepts `*.atlassian.net` endpoint in Jira mode
