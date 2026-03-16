---
date: 2026-03-16
topic: symphony-jira-e2e-poc
---

# Symphony Jira E2E PoC

## What We're Building
We will validate an end-to-end PoC where Symphony reads Jira issues/cards as work input, runs the local orchestration loop, and writes planning outcomes back to Jira as new cards. The PoC target is one complete cycle in a local environment: ingest one Jira issue, execute agent work, produce a planning artifact, and create follow-up Jira cards from that plan.

## Why This Approach
### Approach A: Full Jira migration now
Replace Linear behavior with Jira end-to-end immediately.
Pros: single tracker path, fast strategic alignment.
Cons: high risk, larger blast radius, harder troubleshooting.

### Approach B (Recommended): Incremental Jira adapter PoC
Keep current tracker architecture and add a Jira adapter that supports read + write in a constrained project/scope.
Pros: lowest risk, reuses existing orchestration contracts, easy rollback.
Cons: temporary dual-tracker complexity.

### Approach C: External bridge service
Keep Symphony unchanged and translate Jira through a bridge/proxy.
Pros: minimal Symphony code changes.
Cons: adds another moving part and weakens ownership boundaries.

We choose Approach B because it matches YAGNI and preserves existing proven orchestration behavior.

## Key Decisions
- Build Jira as a first-class `Tracker` adapter using the existing tracker boundary contract.
- PoC includes Jira read (source cards/issues) and Jira write (create cards from agent planning).
- Card creation timing: create Jira cards only after planning is validated, not from draft planning output.
- Operate PoC locally first, then operationalize through `/prompts:lfg` with the required `/prompts:lfg-strict` pre-step.
- Scope PoC to one Jira project/workflow and mark generated cards with a PoC tag/marker.
- Success means at least one reproducible local E2E run completes without human intervention inside the run.

## Open Questions
- None for brainstorm phase.

## Next Steps
- Run `/prompts:ce-plan` to turn this into an implementation plan with acceptance criteria, rollout gates, and validation commands.
