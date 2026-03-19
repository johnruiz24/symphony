# Symphony Frontend POC: Flow Diagrams & State Machines

Companion to `FRONTEND_FLOW_ANALYSIS.md` with detailed visual flows and state machines.

---

## 1. Core User Flows

### Flow 1: Task Creation → Auto-Assign → Execute (Happy Path)

```
TRACKER                ORCHESTRATOR              REACT FRONTEND
  │                        │                          │
  ├─ Create Issue          │                          │
  └─────────────────────>  │                          │
                           ├─ Poll /tracker API      │
                           ├─ Find new issue         │
                           ├─ Evaluate agents        │
                           │  (find least busy)      │
                           │                         │
                           ├─ Agent A selected      │
                           │  (workload: 2/10)      │
                           ├─ Assign task           │
                           ├─ Spawn agent process   │
                           │                         │
                           ├─ Broadcast PubSub      │
                           ├─ Generate SSE event    │
                           └─────────────────────>  │
                                                    ├─ Receive event
                                                    ├─ Update state
                                                    ├─ Re-render
                                                    │  - Show task in Agent A
                                                    │  - Update workload: 3/10
                                                    │  - Show animation
                                                    └─ Display
```

### Flow 2: Drag-Drop Reassignment (Happy Path)

```
USER                 REACT FRONTEND              API BACKEND          ORCHESTRATOR
 │                        │                         │                     │
 ├─ Drag Task #5          │                         │                     │
 │  from Agent A           │                         │                     │
 └────────────────────>   │                         │                     │
                          ├─ Show drop target       │                     │
                          ├─ Highlight Agent B     │                     │
                          │  (workload: 5/10)      │                     │
                          │                        │                     │
 ├─ Drop on Agent B        │                         │                     │
 └────────────────────>   │                         │                     │
                          ├─ Validate:            │                     │
                          │  ✓ Queued task        │                     │
                          │  ✓ Agent online       │                     │
                          │  ✓ Agent not full     │                     │
                          │                        │                     │
                          ├─ Optimistic update    │                     │
                          │  (UI shows new)       │                     │
                          │                        │                     │
                          ├─ POST /api/v1/tasks/5 │                     │
                          │    /reassign          │                     │
                          │    { agent_id: B }    │                     │
                          └───────────────────────>│                     │
                                                   ├─ Validate request   │
                                                   ├─ Find task          │
                                                   ├─ Remove from A      │
                                                   ├─ Enqueue to B       │
                                                   └─────────────────────>│
                                                                         ├─ Re-queue
                                                                         ├─ Update state
                                                                         ├─ Broadcast
                                                                         └─────────┐
                                                                                   │
                                                   <─────────────────────────────┘
                                                   200 OK
                                                   { task, agent_state }
                                                   │
                          <──────────────────────────┘
                          │
                          ├─ Confirm optimistic
                          ├─ Update state
                          ├─ Re-render
                          │  - Task removed from A
                          │  - Task added to B
                          │  - Workload: A(4/10), B(6/10)
                          └─ Display success
```

### Flow 3: Agent Crash Detection (Error Case)

```
AGENT PROCESS       ORCHESTRATOR              REACT FRONTEND
      │                    │                       │
      │ Executing Task #3  │                       │
      │ Running...         │                       │
      │                    │                       │
      ├─ CRASH 💥          │                       │
      └─ (exit)            │                       │
                           │                       │
                           ├─ receive DOWN msg    │
                           │  from agent process  │
                           │                       │
                           ├─ Detect crash       │
                           ├─ Mark agent offline │
                           ├─ Mark task as retry │
                           ├─ Schedule retry     │
                           │  (exponential)      │
                           │                       │
                           ├─ Broadcast event:   │
                           │  agent_crashed      │
                           │  task_retry_queued  │
                           └──────────────────> │
                                               ├─ Receive events
                                               ├─ Update state
                                               │  - Agent A: OFFLINE
                                               │  - Task #3: RETRYING
                                               │  - Retry in: 30s
                                               ├─ Re-render
                                               │  - Agent A card: RED
                                               │  - Show X icon
                                               │  - Disable drag to A
                                               │  - Task moved to retry
                                               │    section
                                               └─ Display
```

### Flow 4: Network Timeout During Reassignment (Error Case)

```
USER            REACT FRONTEND           NETWORK         BACKEND
 │                    │                    │                │
 ├─ Drop Task         │                    │                │
 └───────────────>   │                    │                │
                     ├─ Optimistic        │                │
                     │ update UI          │                │
                     │ (Task now in B)    │                │
                     │                    │                │
                     ├─ POST request      │                │
                     └───────────────────>│                │
                                         │                │
                                         ├─ [5 second    │
                                         │  wait...]      │
                                         │                │
                                         ├─ TIMEOUT       │
                                         └──────X        │
                                                         │
                     <──────────────────────────X        │
                     │                                   │
                     ├─ Error! No response               │
                     ├─ Check optimistic state          │
                     ├─ Decision:                       │
                     │  "Show retry UI"                 │
                     │                                  │
                     ├─ Render:                        │
                     │ "Assignment failed: network     │
                     │  timeout. Retry?"                │
                     │                                  │
                     ├─ User clicks "Retry"            │
                     └───────────────────>│ (re-POST)
                                          │
                                          ├─ [server still
                                          │  processing?]
                                          │
                                          └─ 200 OK ────>│
                                                         │
                                          (state consistent)
```

### Flow 5: Frontend Restart & Reconnect

```
USER                APP INIT            REACT STATE       BACKEND
 │                    │                     │               │
 ├─ Click refresh    │                     │               │
 │ (or page crash)    │                     │               │
 └───────────────>   │                     │               │
                     ├─ App bootstrap     │               │
                     │                     │               │
                     ├─ Fetch /api/v1     │               │
                     │ /state             │               │
                     └──────────────────────────────────>│
                                         │               │
                                         │       ┌───────┤
                                         │       │ Query orchestrator
                                         │       │ Build response
                                         │       │ Serialize JSON
                                         │       │
                                         │   <───┘
                                         │               │
                     <─────────────────────────────────────┤
                     │                     │
                     ├─ Parse JSON        │
                     ├─ Set React state   │
                     │  - agents: [...]   │
                     │  - tasks: [...]    │
                     │  - running: [...]  │
                     │                     │
                     ├─ Subscribe SSE     │
                     └────────────────────────────────>│
                                         │               │
                     <─────────────────────────────────────┤
                     │ (SSE connection open)
                     │
                     ├─ Render UI         │
                     │  - Mini-dashboard  │
                     │  - Task table      │
                     │  - Filters         │
                     └─ DISPLAY
```

---

## 2. State Machines

### Task State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                     TASK LIFECYCLE                          │
└─────────────────────────────────────────────────────────────┘

                    [DISCOVERED]
                          │
                          │ (created in tracker)
                          ↓
                     [QUEUED]◄────────────────┐
                    /        \                │
                   /          \               │ (auto-reassign
                  /            \              │  or retry)
                 /              \             │
                ↓                ↓            │
          [RUNNING]        [REASSIGNING]     │
            /    \              │            │
           /      \             │            │
          ↓        ↓            ↓            │
      [SUCCESS]  [ERROR]──> [RETRY_DUE]────┘
         │         │            │
         │         │            ↓
         │         ↓        [RETRYING]
         │     [FAILED]          │
         │                       ├─→ [SUCCESS] or [FAILED]
         │                       │
         ↓                       ↓
    [ARCHIVED] ◄────────────────┘

Possible Transitions:
- DISCOVERED → QUEUED (always)
- QUEUED → RUNNING (when agent picks up)
- QUEUED → REASSIGNING (when user drag-drops)
- REASSIGNING → QUEUED (new agent)
- RUNNING → SUCCESS (task completed)
- RUNNING → ERROR (task failed)
- ERROR → RETRY_DUE (if retry policy allows)
- RETRY_DUE → RETRYING (when retry scheduled)
- RETRYING → SUCCESS or ERROR (retry attempt)
- SUCCESS → ARCHIVED (after TTL)
- FAILED → ARCHIVED (no more retries)
```

### Agent State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                     AGENT LIFECYCLE                         │
└─────────────────────────────────────────────────────────────┘

              [STARTUP]
                 │
                 ↓
         [ONLINE, IDLE]  ◄─────────────┐
            /         \                 │
           /           \                │ (all tasks done)
          ↓             ↓               │
    [ONLINE]        [ONLINE]           │
    [IDLE]          [BUSY]             │
  (no tasks)    (running tasks)        │
      │              │                  │
      ├─ Task        │ Task             │
      │ assigned?    │ completed?       │
      │ YES          │ YES              │
      │              │                  │
      └──────────────┘                  │
              │                         │
              ├─────────────────────────┘
              │
              ↓
          [ONLINE]
          [CONGESTED]  (at capacity)
              │
              ├─ New slot available?
              │ YES → [ONLINE, BUSY]
              │
              ├─ Heartbeat timeout?
              │ YES
              │ ↓
         [OFFLINE]
         [RECOVERING]  (auto-retry connection)
              │
              ├─ Reconnect OK?
              │ YES → [ONLINE, ...]
              │ NO ↓
         [OFFLINE]
         [CRASHED]     (unrecoverable)
              │
              └─ Manual intervention needed

Timeout Constants:
- Heartbeat: 30 seconds
- Crash detection: 60 seconds
- Offline → Crashed: 5 minutes
```

### Mini-dashboard State Machine (Frontend)

```
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND UI STATE MACHINE                       │
└─────────────────────────────────────────────────────────────┘

            [LOADING]
               │ (initial fetch /api/v1/state)
               │
               ├─ Success? ────┐
               │               │ (data loaded)
               ├─ Timeout?     ↓
               │           [READY]
               │            /    \
               └─ Error?   /      \
                 │        /        \
                 ↓       ↓          ↓
            [ERROR]  [EMPTY]    [RUNNING]
             │       (no agents) (tasks active)
             │           │           │
             │           │    ┌──────┴──────┬────────┐
             │           │    │             │        │
             │           │    ↓             ↓        ↓
             │           │ [NORMAL]  [DEGRADED]  [CRITICAL]
             │           │ (1-3 tasks) (4-7 tasks) (8+ tasks)
             │           │    │             │        │
             │           │    └──────┬───────┴────────┘
             │           │           │
             │           │   SSE event received
             │           │   │
             │           └───┴─> Re-render
             │
             └───→ Retry connection
                   (exponential backoff)
                   │
                   ├─ Success → [READY]
                   └─ Failed → [ERROR]

Update Triggers:
- SSE event: observability_updated
- SSE event: task_assigned, task_completed
- SSE event: agent_online, agent_offline
- SSE event: agent_workload_changed
- Manual: User action (drag-drop)
- Periodic: Full reconciliation every 5 minutes
```

---

## 3. Data Flow Diagrams

### Drag-drop Request Flow (Sequence)

```
participant User as User
participant React as React
participant FrontendAPI as Frontend API Layer
participant Elixir as Elixir Backend
participant Orchestrator as Orchestrator
participant PubSub as PubSub

User->>React: Drag Task #5, Drop on Agent B
React->>React: Validate drop target
React->>React: Optimistic update state
React->>React: Re-render (Task moved to B)
React->>FrontendAPI: POST /api/v1/tasks/5/reassign
FrontendAPI->>Elixir: HTTP POST
Note over Elixir: RequestHandler
Elixir->>Elixir: Validate task exists
Elixir->>Elixir: Validate agent exists & online
Elixir->>Orchestrator: Re-queue task to agent B
Orchestrator->>Orchestrator: Remove from A
Orchestrator->>Orchestrator: Add to B
Orchestrator->>PubSub: Broadcast event
PubSub->>React: SSE event: task_reassigned
Elixir->>FrontendAPI: 200 OK { task, agents }
FrontendAPI->>React: Confirm
React->>React: Merge response data
React->>React: Re-render (final state)
React->>User: Display update

Note over React,User: Total latency: 100-500ms
```

### Real-time Update Flow (SSE)

```
Orchestrator Task State Change:
  1. Task #5 assigned to Agent B
  2. Orchestrator.state updated
  3. PubSub.broadcast(:observability, :observability_updated)
  4. All subscribers notified
  5. SSE connection receives event
  6. Frontend: "observability_updated" event
  7. Frontend calls: GET /api/v1/state (full fetch)
  8. Parses response
  9. React state updated
  10. Components re-render
  11. UI shows new state

Time breakdown:
  - Orchestrator update: ~1ms
  - PubSub broadcast: ~5ms
  - SSE send: ~10ms
  - Frontend receive: ~20-50ms (network)
  - Frontend parse & render: ~50-200ms (React)
  ─────────────────────────────────
  Total: ~100-300ms
```

### Error Recovery Flow (Network Timeout)

```
Scenario: POST /api/v1/tasks/5/reassign times out

Timeline:
  T=0ms:    POST request sent
  T=50ms:   Optimistic UI update
  T=100ms:  Still waiting...
  T=2000ms: Still waiting...
  T=5000ms: TIMEOUT
            ↓
  T=5100ms: Frontend detects timeout
            ├─ Error state set
            ├─ Optimistic update NOT rolled back yet
            ├─ Show retry UI to user
            ├─ "Failed to reassign: network timeout"
            └─ "Retry?" button
            ↓
  User clicks "Retry"
            ↓
  T=5200ms: POST request sent again
  T=5250ms: Still waiting...
  T=5300ms: Response received: 200 OK
            ├─ Verify response matches optimistic
            ├─ Confirm state
            ├─ Clear error
            ├─ Re-render
            └─ Success message (optional)

Alternative (Response arrives late):
  T=6000ms: Response received (was queued)
            ├─ Check if user already retried
            ├─ If yes: ignore late response
            ├─ If no: use response, confirm
```

---

## 4. Component Interaction Diagrams

### Mini-dashboard Component Tree

```
┌─ Dashboard
│  │
│  ├─ Header
│  │  └─ "Agent Workload"
│  │
│  ├─ MiniDashboardStrip (TOP HORIZONTAL)
│  │  │
│  │  ├─ AgentCard (Agent A)
│  │  │  ├─ AgentName
│  │  │  ├─ WorkloadGauge (3/10)
│  │  │  ├─ StatusIndicator (ONLINE)
│  │  │  └─ DropZone (for drag-drop)
│  │  │
│  │  ├─ AgentCard (Agent B)
│  │  │  ├─ AgentName
│  │  │  ├─ WorkloadGauge (5/10)
│  │  │  ├─ StatusIndicator (ONLINE)
│  │  │  └─ DropZone
│  │  │
│  │  ├─ AgentCard (Agent C)
│  │  │  ├─ AgentName
│  │  │  ├─ WorkloadGauge (10/10) ← FULL
│  │  │  ├─ StatusIndicator (CONGESTED)
│  │  │  └─ DropZone (disabled)
│  │  │
│  │  └─ AgentCard (Agent D)
│  │     ├─ AgentName
│  │     ├─ WorkloadGauge (0/10)
│  │     ├─ StatusIndicator (OFFLINE) ← CRASHED
│  │     └─ DropZone (disabled)
│  │
│  ├─ FilterBar
│  │  ├─ SearchInput (search by task name)
│  │  ├─ StatusFilter (running, queued, completed)
│  │  ├─ PriorityFilter (high, medium, low)
│  │  └─ AssigneeFilter (agent dropdown)
│  │
│  ├─ TaskTable (BELOW MINI-DASHBOARD)
│  │  │
│  │  ├─ TableHeader
│  │  │  ├─ Issue ID
│  │  │  ├─ Status
│  │  │  ├─ Assigned To
│  │  │  ├─ Priority
│  │  │  ├─ Created
│  │  │  └─ Runtime
│  │  │
│  │  ├─ TaskRow (draggable)
│  │  │  ├─ IssueLink (LEG-123)
│  │  │  ├─ StatusBadge (QUEUED, RUNNING, etc.)
│  │  │  ├─ AssigneeName (Agent A)
│  │  │  ├─ PriorityTag (HIGH)
│  │  │  ├─ CreatedTime (3 hours ago)
│  │  │  └─ RuntimeDisplay (1m 23s)
│  │  │
│  │  ├─ TaskRow
│  │  │  └─ [similar structure]
│  │  │
│  │  └─ PaginationControls (if needed)
│  │
│  ├─ MetricCards
│  │  ├─ TotalRunning (3)
│  │  ├─ TotalQueued (7)
│  │  ├─ TotalRetrying (1)
│  │  └─ TokenUsage (50K/100K)
│  │
│  └─ ErrorBoundary
│     ├─ ConnectionError (show if SSE down)
│     └─ RetryButton
```

### Drag-drop Interaction Zones

```
┌────────────────────────────────────────────────────────┐
│            MINI-DASHBOARD STRIP (TOP)                 │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Agent A    │  │  Agent B    │  │  Agent C    │  │
│  │             │  │             │  │             │  │
│  │ ██░░░░░░░░░ │  │ ██████░░░░░ │  │ ███████████ │  │
│  │  3/10       │  │  5/10 ✓     │  │  10/10 ✗    │  │
│  │ ONLINE      │  │ ONLINE      │  │ FULL        │  │
│  │             │  │             │  │             │  │
│  │ DROP ZONE  │  │ DROP ZONE  │  │ DROP ZONE  │  │
│  │ (active)    │  │ (active)   │  │ (disabled)  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘
                        ↑
        Drag Task #5 from table here
        Drop on Agent B drop zone
        (visual highlight on hover)


┌────────────────────────────────────────────────────────┐
│            TASK TABLE (BELOW)                          │
├────────────────────────────────────────────────────────┤
│ Issue   Status    Assigned   Priority   Runtime        │
├────────────────────────────────────────────────────────┤
│ LEG-123 QUEUED    Agent A    HIGH       —             │ ← Drag me
│ LEG-124 RUNNING   Agent B    MEDIUM     1m 23s        │
│ LEG-125 QUEUED    Agent C    LOW        —             │
│ LEG-126 RETRYING  (none)     HIGH       retry in 30s  │
│ LEG-127 QUEUED    Agent A    HIGH       —             │
│ ...                                                    │
└────────────────────────────────────────────────────────┘

Visual feedback during drag:
- Source row: opacity 0.5, highlight
- Drag image: Task card with "→ Agent B"
- Agent B drop zone: Green outline, background color change
- Other agents: Gray out, show "disabled" state
```

---

## 5. Error State Diagrams

### Error Scenario: All Agents at Capacity

```
User Action:
  Drag Task #5 to any agent

Frontend Validation:
  ├─ Find target agent
  ├─ Check: agent.workload < agent.capacity?
  │
  └─ NO (all agents full)
      │
      ├─ Prevent drop
      ├─ Show drop target RED
      ├─ Show tooltip: "Agent at capacity"
      └─ On drop: No POST request
         │
         └─ Show error: "Cannot assign: all agents at capacity"
            ├─ Option 1: "Wait for slot" (task stays queued)
            ├─ Option 2: "Force assign" (will queue)
            └─ Option 3: "Cancel" (drop aborted)

Backend Fallback:
  (If frontend validation fails and POST sent anyway)
  ├─ Validate capacity again
  ├─ If exceeded: 400 Bad Request
  ├─ Response: { error: "agent_at_capacity" }
  └─ Frontend shows error to user
```

### Error Scenario: Agent Went Offline

```
Before Drop:
  Agent B status: ONLINE
  ├─ Valid drop target
  └─ User initiates drag

During Drag:
  SSE event: agent_offline { agent_id: B }
  ├─ Frontend updates state
  ├─ Re-renders Agent B card
  │  ├─ Status: RED
  │  ├─ Icon: X
  │  └─ DropZone: disabled
  └─ User still dragging (may not notice)

On Drop:
  User drops on Agent B (now offline)
  ├─ Frontend: "Hmm, Agent B just went offline"
  ├─ Two strategies:
  │
  ├─ Strategy 1: Show warning
  │  ├─ "Agent B is now offline. Really assign?"
  │  ├─ Options: "Yes, queue anyway" / "No, cancel"
  │  └─ If yes: POST request sent
  │
  └─ Strategy 2: Silently handle
      ├─ Prevent drop (user can't)
      ├─ Show reason in tooltip
      └─ Don't POST

Backend Response:
  (If POST sent for offline agent)
  ├─ Validate: is agent online?
  ├─ NO → 400 Bad Request
  ├─ Response: { error: "agent_offline" }
  └─ Frontend: "Assignment failed: Agent B is offline"
     └─ Show retry or cancel
```

---

## 6. Timing Diagrams

### Optimal Case: Full Operation

```
Timeline (seconds):
  0.0  User opens dashboard
       ├─ GET /api/v1/state
       ├─ Subscribe /api/v1/events (SSE)
       └─ Display loaded

  2.5  Task #5 created in tracker
       ├─ Next poll cycle (5s)
       └─ [waiting]

  5.0  Orchestrator polls
       ├─ Finds Task #5
       ├─ Assigns to Agent A
       ├─ Broadcast event: task_assigned
       ├─ PubSub → SSE
       └─ Latency: ~20ms

  5.1  Frontend SSE receives event
       ├─ GET /api/v1/state (refresh)
       ├─ Parse
       ├─ React render
       └─ Latency: ~100ms

  5.2  UI updated
       ├─ Task #5 appears under Agent A
       ├─ Workload: 3/10 → 4/10
       └─ Animation plays

  8.0  User drags Task #5 to Agent B
       ├─ Optimistic update
       └─ POST /api/v1/tasks/5/reassign

  8.1  Backend receives request
       ├─ Validate
       ├─ Re-queue
       ├─ Broadcast
       └─ Response 200 OK

  8.2  Frontend receives response
       ├─ Confirm optimistic update
       ├─ Re-render
       └─ Latency: ~50-100ms (total)

  8.3  UI updated
       ├─ Task #5 moved to Agent B
       └─ Workload: A(3/10), B(6/10)
```

### Degraded Case: Network Slow

```
Timeline (seconds):
  0.0  User opens dashboard
       ├─ GET /api/v1/state (SLOW)
       └─ Show loading spinner

  3.0  Response finally arrives
       ├─ Parse
       ├─ Display (3s latency!)
       └─ Subscribe SSE

  5.0  Task #5 appears
       ├─ Gets assigned
       ├─ SSE event sent
       └─ [waiting for update]

  8.0  Frontend gets SSE event
       ├─ GET /api/v1/state (SLOW again)
       └─ Show loading

  10.0 Response finally arrives
       ├─ UI updates
       └─ Total latency: 5 seconds!

  12.0 User drags Task #5
       ├─ POST /api/v1/tasks/5/reassign (SLOW)
       ├─ Optimistic update
       └─ Show loading spinner

  17.0 Response finally arrives (5s later)
       ├─ Confirm
       ├─ Show success
       └─ User may have given up!
```

### Error Case: Connection Lost

```
Timeline (seconds):
  0.0  Working normally
       ├─ SSE connected
       └─ Real-time updates flowing

  30.0 Network hiccup
       ├─ SSE closes
       ├─ Frontend detects
       └─ "Connection lost, reconnecting..."

  30.5 Frontend auto-reconnect (backoff)
       ├─ Try SSE: /api/v1/events
       ├─ Still offline
       └─ Retry again in 5s

  35.5 Network restored
       ├─ Try SSE again
       └─ SUCCESS!

  35.6 SSE reconnected
       ├─ Frontend: "Reconnected"
       ├─ Full reconciliation: GET /api/v1/state
       └─ Catch up on any missed events

  35.8 UI updated with all changes during disconnection
       └─ Seamless resume
```

---

## Conclusion

These diagrams supplement the main `FRONTEND_FLOW_ANALYSIS.md` document with visual representations of:

1. **User flows** - Step-by-step interactions
2. **State machines** - Valid state transitions
3. **Data flows** - Information movement
4. **Component hierarchy** - UI structure
5. **Error scenarios** - What goes wrong
6. **Timing** - Latency in different conditions

Together, these provide a complete picture of the system behavior before implementation begins.

---

**Document Status:** Ready for design review
**Last Updated:** March 18, 2026
