---
title: feat: Symphony Jira E2E PoC
type: feat
status: active
date: 2026-03-16
origin: docs/brainstorms/2026-03-16-symphony-jira-e2e-poc-brainstorm.md
---

# feat: Symphony Jira E2E PoC

## Overview
Build a constrained end-to-end PoC where Symphony can: (1) read work from Jira as tracker source, (2) execute local orchestration, and (3) create Jira cards from validated planning output. The rollout is local-first and additive, preserving existing Linear flow.

## Problem Statement
Current implementation is Linear-centric for tracker operations and dynamic tooling. Tracker behavior is abstracted and pluggable, but only Linear + memory are active adapters today. We need Jira support for a real PoC without destabilizing current orchestration.

## Current State Evidence
- Tracker abstraction exists in `elixir/lib/symphony_elixir/tracker.ex`.
- Adapter selection currently routes unknown kinds to Linear in `Tracker.adapter/0`.
- Config schema validates tracker kind and defaults around Linear in `elixir/lib/symphony_elixir/config/schema.ex`.
- Workflow contract is status-driven and autonomous in `elixir/WORKFLOW.md`.
- Brainstorm decisions: `docs/brainstorms/2026-03-16-symphony-jira-e2e-poc-brainstorm.md`.

## Goals
- Add Jira as supported tracker kind for candidate issue polling.
- Support tracker writes for Jira comment + state transition.
- Provide a PoC flow to create Jira cards from validated plan output.
- Preserve existing Linear behavior and tests.

## Non-Goals
- Full bidirectional sync for all Jira fields.
- Production-grade auth hardening beyond PoC controls.
- Replacing the existing Linear dynamic GraphQL tool.

## Proposed Solution

### 1. Jira Tracker Integration (Read + Core Writes)
- Add `jira` support in config validation and adapter resolution.
- Add `SymphonyElixir.Jira.Client` for Jira REST calls with auth.
- Add `SymphonyElixir.Jira.Adapter` implementing `SymphonyElixir.Tracker` callbacks:
  - `fetch_candidate_issues/0` via JQL on project + active statuses.
  - `fetch_issues_by_states/1` and `fetch_issue_states_by_ids/1`.
  - `create_comment/2` on issue.
  - `update_issue_state/2` through transition lookup + transition call.
- Normalize Jira issue payload to existing internal issue struct used by orchestrator.

#### Detailed Tracker Contract for Jira
- Proposed front-matter fields under `tracker`:
  - `kind: jira`
  - `endpoint: https://<org>.atlassian.net`
  - `project_key: <PROJECT>`
  - `api_email: $JIRA_API_EMAIL`
  - `api_token: $JIRA_API_TOKEN`
  - `active_states: [...]` mapped to Jira status names
  - `terminal_states: [...]` mapped to Jira status names
- Environment resolution rule:
  - Keep same `$VAR` behavior already used by config schema and workflow parsing.
- Backward compatibility:
  - Existing `linear` and `memory` behavior remains unchanged.

#### Jira REST Endpoint Map (PoC)
- Candidate polling:
  - `POST /rest/api/3/search/jql` with JQL on project + active statuses.
- Fetch by IDs:
  - `POST /rest/api/3/search/jql` with JQL `id in (...)`.
- Comment create:
  - `POST /rest/api/3/issue/{issueIdOrKey}/comment`.
- Transition list + move:
  - `GET /rest/api/3/issue/{issueIdOrKey}/transitions`
  - `POST /rest/api/3/issue/{issueIdOrKey}/transitions`

### 2. Plan-to-Jira Card Publishing (PoC Destination)
- Add a focused command/module to create Jira cards from validated plan markdown:
  - Parse checklist items from approved plan section.
  - Create one Jira issue per selected planning item.
  - Mark generated cards with PoC marker label/tag and backlink in description.
- Keep this as explicit PoC operation to avoid hidden automation risks.

#### Plan Publishing Rules (Deepened)
- Source of truth:
  - Only publish from checked items in an explicit plan section (for example `## Jira Publish` or `## MVP`).
- Card title format:
  - Prefix with parent context: `[Symphony PoC] <plan item title>`.
- Card body template:
  - Include source plan path, parent issue key, and immutable item fingerprint.
- Idempotency:
  - Compute deterministic fingerprint from `plan_path + section + item_text`.
  - Before create, search existing issues with fingerprint marker; skip if found.
- Failure handling:
  - Partial failures must be logged item-by-item with retry-safe behavior.

### 3. Workflow + Docs for Local E2E
- Add a Jira-oriented workflow example for local runs.
- Document required env vars and minimal Jira project setup.
- Document PoC execution path:
  1. Poll Jira source issue.
  2. Run Symphony local orchestration.
  3. Validate plan output.
  4. Publish follow-up cards to Jira.

#### Local PoC Execution Matrix
- Mode A: Jira source + local worker.
- Mode B: Jira source + SSH worker (optional stretch if A is stable).
- Plan publishing run:
  - Manual command as PoC checkpoint after plan validation.
- Evidence required:
  - Log slice with source issue ingestion.
  - Log slice with card creation response IDs.
  - Generated list of Jira keys created from plan.

## Spec/Flow Validation (Edge Cases)
- Empty JQL result should not crash polling loop.
- Transition lookup failures should surface clear errors.
- Plan publishing must be idempotent per item key/marker.
- Missing Jira credentials must fail fast at config validation.

## Implementation Plan

### Phase 1: Config + Adapter Skeleton
- [x] Extend schema/config to support `tracker.kind: jira` and Jira credentials/settings.
- [x] Implement `Jira.Client` request/auth helpers.
- [x] Add adapter selection branch for Jira.

### Phase 2: Jira Read/Write Behavior
- [x] Implement Jira issue fetch paths (candidate, by state, by id).
- [x] Implement comment creation.
- [x] Implement state transition update.
- [x] Add tests for normalization, auth failures, transition mapping, and polling behavior.

### Phase 3: Plan Publishing to Jira
- [x] Implement plan parser + card creation publisher.
- [x] Add idempotency marker behavior.
- [x] Add tests for markdown parsing and Jira create payload generation.

### Phase 4: Local E2E PoC Validation
- [x] Add/update docs and sample workflow for Jira mode.
- [ ] Run targeted tests + repo quality gate.
- [ ] Run local dry-run PoC and capture evidence logs.

## Acceptance Criteria
- [ ] `tracker.kind: jira` is accepted and routes through Jira adapter.
- [ ] Symphony can fetch at least one Jira issue as candidate work.
- [ ] Symphony can post comment + transition state on Jira issue.
- [ ] Validated plan items can be published as Jira cards with PoC marker.
- [ ] Existing Linear tests/flow remain green.

## Validation
- [ ] Unit tests for Jira client/adapter and plan publishing parser.
- [ ] Integration-like test for orchestrator candidate polling in Jira mode.
- [ ] `make -C elixir all` passes.

## Test Matrix (Deepened)
- Config tests:
  - Accept valid Jira config, reject missing required Jira fields.
- Client tests:
  - 200 success payload decode, 401 auth failure, 429/5xx retry-safe behavior.
- Adapter tests:
  - Candidate filtering by active states.
  - Correct mapping of Jira status to internal state string.
  - Comment create and transition update payload correctness.
- Plan publishing tests:
  - Markdown parsing of checklist items.
  - Idempotency fingerprint generation.
  - Duplicate prevention when marker already exists.
- Regression tests:
  - Ensure `linear` mode tests still pass unchanged.

## Risks and Mitigations
- Jira workflow/state naming mismatch:
  - Mitigate with explicit mapping config and clear errors.
- API auth and rate limits:
  - Start with low polling frequency and retry-safe request wrappers.
- Scope creep into full sync platform:
  - Enforce PoC guardrails and non-goals.

## Rollout and Operational Checks (Deepened)
- Rollout sequence:
  1. Land config + Jira client/adapter behind `tracker.kind: jira`.
  2. Land plan publisher command/module.
  3. Run PoC in isolated Jira project.
- Runtime checks:
  - Poll loop continues on Jira API failure without daemon crash.
  - Dashboard/API still renders when Jira mode is active.
  - Created Jira cards include source markers for auditability.
- Rollback:
  - Switch workflow back to `tracker.kind: linear` and stop using publisher command.

## Sources
- Brainstorm: `docs/brainstorms/2026-03-16-symphony-jira-e2e-poc-brainstorm.md`
- Jira REST API v3 intro: https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/
- Jira issue search APIs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/
- Jira basic auth guidance: https://developer.atlassian.com/cloud/jira/service-desk/basic-auth-for-rest-apis/
