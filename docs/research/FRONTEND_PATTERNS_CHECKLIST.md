# Frontend Development Patterns Checklist

**For React/TypeScript developers building Symphony frontends**

---

## Before You Start: Read These Files (15 minutes)

- [ ] `ARCHITECTURE.md` - System overview (read sections 1-3)
- [ ] `REACT_INTEGRATION_PLAN.md` - Migration strategy (read Part 2: API Contract)
- [ ] `INSTITUTIONAL_LEARNINGS.md` - This doc (reference during dev)
- [ ] `/api/v1/state` live response (understand data shapes)

---

## API Integration Checklist

### Type Safety (TypeScript)

```typescript
// types/orchestra.types.ts - Copy these definitions
export interface OrchestrationState {
  generated_at: string;  // ISO 8601
  counts: { running: number; retrying: number };
  running: RunningEntry[];
  retrying: RetryEntry[];
  codex_totals: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    seconds_running: number;
  };
  rate_limits: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface RunningEntry {
  issue_id: string;
  issue_identifier: string;  // Use this in URLs
  state: string;
  worker_host: string;
  workspace_path: string;
  session_id: string;
  turn_count: number;
  last_event: string;
  last_message: string;
  started_at: string;
  last_event_at: string;
  tokens: { input_tokens: number; output_tokens: number; total_tokens: number };
}

export interface RetryEntry {
  issue_id: string;
  issue_identifier: string;
  attempt: number;
  due_at: string;
  error: string;
  worker_host: string | null;
  workspace_path: string;
}
```

### Error Handling

- [ ] **Always check `state.error` before accessing fields**
  ```typescript
  if (state?.error) {
    if (state.error.code === 'snapshot_timeout') {
      // Show stale data + "Loading..." indicator
    } else {
      // Show error UI
    }
    return;
  }
  ```

- [ ] **Implement retry on timeout**
  ```typescript
  let retries = 0;
  const MAX_RETRIES = 3;

  async function fetchWithRetry() {
    try {
      const resp = await fetch('/api/v1/state');
      const data = await resp.json();

      if (data.error?.code === 'snapshot_timeout' && retries < MAX_RETRIES) {
        retries++;
        await new Promise(r => setTimeout(r, 1000 * retries));
        return fetchWithRetry();
      }
      return data;
    } catch (err) {
      if (retries < MAX_RETRIES) {
        retries++;
        await new Promise(r => setTimeout(r, 1000 * retries));
        return fetchWithRetry();
      }
      throw err;
    }
  }
  ```

- [ ] **Handle null values gracefully**
  ```typescript
  // worker_host can be null for completed retries
  const host = entry.worker_host || 'unknown';
  ```

### Real-time Updates (SSE)

- [ ] **Implement EventSource subscription**
  ```typescript
  useEffect(() => {
    const eventSource = new EventSource('/api/v1/events');

    eventSource.addEventListener('observability_updated', async () => {
      // Re-fetch state (don't try to patch it)
      const newState = await fetch('/api/v1/state').then(r => r.json());
      if (!newState.error) {
        setState(newState);
      }
    });

    eventSource.onerror = () => {
      eventSource.close();
      // Browser will auto-reconnect
    };

    return () => eventSource.close();
  }, []);
  ```

- [ ] **Fallback polling (no SSE available)**
  ```typescript
  // Poll every 30 seconds as fallback
  useEffect(() => {
    const interval = setInterval(async () => {
      const newState = await fetch('/api/v1/state').then(r => r.json());
      if (!newState.error) {
        setState(newState);
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, []);
  ```

---

## Frontend Component Patterns

### Metric Cards

```typescript
interface MetricCardProps {
  label: string;
  value: string | number;
  detail?: string;
  highlight?: boolean;
}

export function MetricCard({ label, value, detail, highlight }: MetricCardProps) {
  return (
    <article className={`metric-card ${highlight ? 'highlight' : ''}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value numeric">{formatInt(value)}</p>
      {detail && <p className="metric-detail">{detail}</p>}
    </article>
  );
}

// Usage
<MetricCard label="Running" value={state.counts.running} detail="Active agents" />
```

### Tables with Real-time Updates

```typescript
export function RunningTable({ entries }: { entries: RunningEntry[] }) {
  return (
    <section className="section-card">
      <h2 className="section-title">Running sessions</h2>
      {entries.length === 0 ? (
        <p className="empty-state">No sessions running</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Issue</th>
              <th>State</th>
              <th>Session</th>
              <th>Runtime</th>
              <th>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={entry.session_id}>
                <td>
                  <a href={`/issues/${entry.issue_identifier}`}>
                    {entry.issue_identifier}
                  </a>
                </td>
                <td>
                  <span className={`state-badge state-badge-${entry.state}`}>
                    {entry.state}
                  </span>
                </td>
                <td className="monospace">{entry.session_id}</td>
                <td>{formatRuntimeSeconds(entry.tokens.total_tokens)}</td>
                <td>{formatInt(entry.tokens.total_tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

### Status Indicators

```typescript
function StatusBadge({ state }: { state: string }) {
  const statusMap: Record<string, string> = {
    running: 'status-badge-live',
    completed: 'status-badge-success',
    error: 'status-badge-danger',
    retrying: 'status-badge-warning',
  };

  return (
    <span className={`status-badge ${statusMap[state] || ''}`}>
      <span className="status-badge-dot"></span>
      {state.charAt(0).toUpperCase() + state.slice(1)}
    </span>
  );
}
```

---

## Formatting & Display Helpers

### Numbers

```typescript
export function formatInt(n: number | string): string {
  return Number(n).toLocaleString('en-US');
}

// Usage
formatInt(50000) // "50,000"
formatInt('1000') // "1,000"
```

### Time/Duration

```typescript
export function formatRuntimeSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (minutes < 60) return `${minutes}m ${secs}s`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// Usage
formatRuntimeSeconds(3661) // "1h 1m"
formatRuntimeSeconds(125) // "2m 5s"
```

### ISO Timestamps

```typescript
export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC'
  }).format(date);
}

// Usage
formatTimestamp("2026-03-18T12:34:56Z") // "03/18/2026, 12:34:56"
```

### Truncation

```typescript
export function truncate(str: string, maxLength: number = 60): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

// Usage
truncate("This is a very long message...", 20) // "This is a very lo..."
```

---

## Testing Patterns

### Component Snapshots

```typescript
// tests/components/MetricCard.test.tsx
import { render } from '@testing-library/react';
import { MetricCard } from '../MetricCard';

describe('MetricCard', () => {
  it('renders with provided data', () => {
    const { container } = render(
      <MetricCard label="Running" value={3} detail="Active sessions" />
    );
    expect(container).toMatchSnapshot();
  });
});
```

### State Management Tests

```typescript
// tests/hooks/useOrchestrationState.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useOrchestrationState } from '../useOrchestrationState';

describe('useOrchestrationState', () => {
  it('fetches and parses state correctly', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({
          generated_at: '2026-03-18T12:34:56Z',
          counts: { running: 3, retrying: 1 },
          running: [],
          retrying: [],
          codex_totals: { ... },
          rate_limits: { ... }
        })
      } as Response)
    );

    const { result } = renderHook(() => useOrchestrationState());

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
      expect(result.current.loading).toBe(false);
    });
  });
});
```

### API Contract Tests

```typescript
// tests/api.test.ts
describe('API Contract', () => {
  it('GET /api/v1/state returns valid shape', async () => {
    const resp = await fetch('/api/v1/state');
    const state = await resp.json();

    expect(state).toHaveProperty('generated_at');
    expect(state).toHaveProperty('counts');
    expect(state.counts).toHaveProperty('running');
    expect(state.counts).toHaveProperty('retrying');

    if (!state.error) {
      expect(state).toHaveProperty('running');
      expect(Array.isArray(state.running)).toBe(true);
    }
  });

  it('GET /api/v1/:issue_identifier returns per-issue detail', async () => {
    const resp = await fetch('/api/v1/LEG-123');
    const detail = await resp.json();

    if (resp.ok) {
      expect(detail).toHaveProperty('issue_identifier', 'LEG-123');
      expect(detail).toHaveProperty('status');
    }
  });
});
```

---

## Performance Optimizations

### Memoization

```typescript
import { useMemo } from 'react';

function Dashboard({ state }: { state: OrchestrationState }) {
  // Don't recalculate if state hasn't changed
  const sortedRunning = useMemo(
    () => [...state.running].sort((a, b) => a.issue_identifier.localeCompare(b.issue_identifier)),
    [state.running]
  );

  return (
    // render sortedRunning
  );
}
```

### Callback Optimization

```typescript
import { useCallback } from 'react';

function Dashboard() {
  const refetch = useCallback(async () => {
    const resp = await fetch('/api/v1/state');
    const data = await resp.json();
    // ... update state
  }, []);

  // Pass stable callback to child components
  return <Table onRefresh={refetch} />;
}
```

### Virtual Scrolling (for large tables)

```typescript
import { FixedSizeList } from 'react-window';

function LargeRunningTable({ entries }: { entries: RunningEntry[] }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={entries.length}
      itemSize={50}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <TableRow entry={entries[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

---

## Common Pitfalls & Solutions

### Pitfall 1: Not Checking for Error Before Using State

```typescript
// BAD ❌
const { state } = await fetch('/api/v1/state').then(r => r.json());
console.log(state.running[0].issue_id);  // Crashes if error

// GOOD ✅
const response = await fetch('/api/v1/state').then(r => r.json());
if (response.error) {
  showError(response.error.message);
  return;
}
console.log(response.running[0].issue_id);  // Safe
```

### Pitfall 2: Trusting Client-side Time

```typescript
// BAD ❌
const elapsed = new Date() - new Date(entry.started_at);

// GOOD ✅
const elapsed = state.codex_totals.seconds_running;
// Or calculate once on mount, don't recalculate every render
```

### Pitfall 3: Missing CORS

```typescript
// BAD ❌
// No CORS headers = browser blocks request
fetch('http://localhost:4000/api/v1/state');

// GOOD ✅
// Add to backend endpoint.ex:
// plug Corsica, origins: "*"
// Then frontend can fetch
```

### Pitfall 4: Unhandled Promise Rejection

```typescript
// BAD ❌
const data = await fetch('/api/v1/state').then(r => r.json());
setState(data);

// GOOD ✅
try {
  const resp = await fetch('/api/v1/state');
  const data = await resp.json();
  if (!data.error) {
    setState(data);
  }
} catch (err) {
  console.error('Failed to fetch state:', err);
  setError(err);
}
```

### Pitfall 5: Memory Leaks with EventSource

```typescript
// BAD ❌
useEffect(() => {
  const eventSource = new EventSource('/api/v1/events');
  eventSource.addEventListener('message', () => refetch());
  // Missing cleanup!
});

// GOOD ✅
useEffect(() => {
  const eventSource = new EventSource('/api/v1/events');
  eventSource.addEventListener('message', () => refetch());

  return () => eventSource.close();  // Cleanup!
}, [refetch]);
```

---

## Design System (CSS Classes)

Copy from `/elixir/priv/static/dashboard.css`:

### Colors
```css
:root {
  --page: #f7f7f8;           /* Background */
  --card: rgba(255, 255, 255, 0.94);
  --ink: #202123;            /* Text */
  --muted: #6e6e80;          /* Secondary text */
  --accent: #10a37f;         /* Primary */
  --danger: #b42318;         /* Error */
}
```

### Components
```css
.metric-card { ... }
.data-table { ... }
.state-badge { ... }
.status-badge { ... }
.empty-state { ... }
```

---

## Deployment Checklist

Before shipping:

- [ ] **Type checking passes**
  ```bash
  npm run type-check
  ```

- [ ] **Tests pass**
  ```bash
  npm run test
  ```

- [ ] **Build succeeds**
  ```bash
  npm run build
  ```

- [ ] **Linting passes**
  ```bash
  npm run lint
  ```

- [ ] **API contract validated** (hit `/api/v1/state` with real backend)

- [ ] **Error cases handled** (timeout, network error, missing issue)

- [ ] **Real-time updates work** (SSE or polling)

- [ ] **Performance verified** (DevTools, no memory leaks)

- [ ] **Accessibility checked** (keyboard nav, color contrast)

- [ ] **Documentation updated** (README, API docs)

---

## Quick Command Reference

```bash
# Setup
npm install

# Development
npm run dev              # Vite dev server
npm run type-check      # TypeScript checking

# Testing
npm run test            # Run tests
npm run test:watch      # Watch mode
npm test -- Dashboard   # Specific test

# Linting & Formatting
npm run lint            # ESLint
npm run format          # Prettier

# Build & Deploy
npm run build           # Production build
npm run preview         # Preview build locally
```

---

## When to Reach Out

- **API contract unclear?** → Read `Presenter.state_payload()` in `elixir/lib/symphony_elixir_web/presenter.ex`
- **Real-time not working?** → Check `/api/v1/events` endpoint exists
- **Types not matching?** → Compare response from `/api/v1/state` with TypeScript interfaces
- **Performance issues?** → Profile in DevTools; check for unnecessary re-renders
- **Tests failing?** → Run `npm run test:watch` and debug interactively

---

**Last Updated:** March 18, 2026
**Version:** 1.0
**Status:** Ready for Development
