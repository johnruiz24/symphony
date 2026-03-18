---
tracker:
  kind: memory
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Canceled
workspace:
  root: ../tmp/workspaces-agentic
agent:
  max_turns: 1
codex:
  command: codex app-server
---
You are working on issue {{ issue.identifier }}.

Title: {{ issue.title }}
Body: {{ issue.description }}
