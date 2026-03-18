# ADR-004: TOP Strip for Agent Cards (Not Sidebar)

**Status:** Accepted
**Date:** 2026-03-18
**Context:** Symphony Frontend POC -- agent status display pattern

---

## Context

The Symphony Frontend POC displays agent cards on a Kanban board. Each card represents an issue being worked by an autonomous agent. The key UX challenge is: **how to show agent status information on the card without cluttering the primary task content.**

Agent-specific metadata includes:
- Current agent state (running, retrying, idle)
- Token usage (input/output/total)
- Turn count
- Last event type and timestamp
- Worker host (local vs. SSH remote)
- Error information (for retrying agents)

This information is secondary to the issue's own content (title, identifier, labels) but is critical for operational visibility.

---

## Decision

Display agent status as a **colored TOP strip** on each card, rather than in a sidebar panel or overlay.

---

## Rationale

### 1. Immediate visual scanning

A colored strip at the top of each card provides instant status recognition:
- **Green strip** -- Agent running, healthy
- **Yellow/amber strip** -- Agent retrying, backoff in progress
- **Red strip** -- Agent failed, needs attention
- **Gray strip** -- No agent assigned, idle

Operators can scan the entire Kanban board and immediately identify problem areas without clicking into any card. This is analogous to CI status indicators on PR lists.

### 2. Preserves card content area

A sidebar approach would either:
- **Narrow the card content** -- Reducing space for issue titles and metadata
- **Widen the card** -- Breaking Kanban column layouts
- **Add a toggle** -- Requiring clicks to see agent status

The top strip approach uses minimal vertical space (4-6px) while leaving the full card width available for issue content.

### 3. Works at all Kanban zoom levels

Whether the board shows 3 columns or 8, the top strip remains visible:
- At normal zoom: strip color + optional inline text (e.g., "T:5 | 12k tokens")
- At compact zoom: strip color only (still conveys status)
- At expanded zoom: strip can include full agent status bar

A sidebar would become invisible or impractical at compact zoom levels.

### 4. Consistent with material design card patterns

Top-colored strips (sometimes called "card accent" or "card indicator") are an established pattern in:
- Trello (label colors at card top)
- Jira (priority/status indicators)
- GitHub Projects (status chips)

Users already understand that a colored strip at the card edge conveys categorical status.

### 5. Accessible and color-blind friendly

The strip can be paired with:
- Icon indicators (checkmark, spinner, warning triangle)
- Tooltip on hover with full status text
- ARIA labels for screen readers

Color alone is never the sole information channel.

---

## Consequences

### Positive
- Zero-click status visibility across the entire board
- Minimal space overhead (4-6px per card)
- Scales well from compact to expanded views
- Familiar pattern that requires no user training

### Negative
- Limited space for detailed agent info in the strip itself
- Users must still click/hover for full agent details (token counts, error messages)
- Multiple status dimensions (health + progress + errors) may be hard to encode in a single strip color

### Mitigations
- On hover: expand the strip to show a mini-status bar with key metrics
- On click: open a detail panel (slide-out or modal) with full agent session info
- Use strip width or gradient to encode a second dimension (e.g., progress %)

---

## Design Specification

### Strip States

| State | Color | Icon | Strip Text (hover/expanded) |
|-------|-------|------|-----------------------------|
| Running | `#22c55e` (green-500) | Spinning dot | `Turn 5 | 12k tokens | 2m ago` |
| Retrying | `#f59e0b` (amber-500) | Warning triangle | `Retry #2 | due in 45s | timeout` |
| Failed | `#ef4444` (red-500) | X circle | `Failed | 3 attempts | see logs` |
| Idle | `#9ca3af` (gray-400) | Empty circle | `No agent assigned` |
| Completing | `#3b82f6` (blue-500) | Checkmark | `Completing | PR attached` |

### Layout

```
+--[GREEN STRIP]------------------------------------------+
|                                                          |
|  PROJ-42                                    In Progress  |
|  Implement user authentication flow                      |
|                                                          |
|  Labels: [auth] [backend]                               |
|                                                          |
+----------------------------------------------------------+
```

### Expanded (on hover):

```
+--[GREEN: Turn 5 | 12k tokens | 2m ago ]----------------+
|                                                          |
|  PROJ-42                                    In Progress  |
|  Implement user authentication flow                      |
|                                                          |
|  Labels: [auth] [backend]                               |
|                                                          |
+----------------------------------------------------------+
```

---

## Alternatives Considered

### Sidebar panel
A dedicated sidebar showing agent details for the selected card. Rejected because:
- Takes significant horizontal space
- Only shows one agent at a time
- Requires selection interaction before any status is visible

### Badge/chip on card
Small status badges within the card body. Rejected because:
- Competes with other card content for limited space
- Less scannable than a consistent positional indicator
- Inconsistent placement as card content varies

### Overlay/tooltip only
Show agent status only on hover. Rejected because:
- No passive visibility -- operators must actively hover each card
- Cannot scan board-level health at a glance
- Breaks the monitoring use case (status should be ambient)

### Bottom strip
Same concept but at card bottom. Rejected because:
- Cards in a column may have variable heights, making bottom strips misaligned
- Top position is more naturally scanned (top-to-bottom reading order)
- Top strips are the established convention (Trello labels, etc.)
