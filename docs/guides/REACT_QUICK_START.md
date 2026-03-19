# React Frontend Quick Start Guide

**Quick reference for developers starting React integration**

---

## TL;DR

1. **Current:** Phoenix LiveView (server-rendered, no JS framework)
2. **API:** 3 JSON endpoints at `/api/v1/*`
3. **State:** All in-memory GenServer (no database)
4. **Real-time:** PubSub broadcast on state changes
5. **Build:** Vite (or Next.js/CRA) into `elixir/priv/static/`

---

## 1. API Quick Reference

### Fetch Full State
```bash
curl http://localhost:4000/api/v1/state
```

### Fetch Issue Detail
```bash
curl http://localhost:4000/api/v1/LEG-123
```

### Trigger Poll
```bash
curl -X POST http://localhost:4000/api/v1/refresh
```

### Real-time Updates (Current)
```javascript
// Phoenix LiveView WebSocket (not recommended for React)
// Instead: use polling or implement SSE
```

---

## 2. Data Models (Copy/Paste)

### TypeScript Interfaces

```typescript
export interface OrchestrationState {
  generated_at: string;
  counts: {
    running: number;
    retrying: number;
  };
  running: RunningEntry[];
  retrying: RetryEntry[];
  codex_totals: CodexTotals;
  rate_limits: Record<string, any>;
  error?: ApiError;
}

export interface RunningEntry {
  issue_id: string;
  issue_identifier: string;
  state: string;
  worker_host: string;
  workspace_path: string;
  session_id: string;
  turn_count: number;
  last_event: string;
  last_message: string;
  started_at: string;
  last_event_at: string;
  tokens: TokenUsage;
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

export interface CodexTotals {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  seconds_running: number;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface ApiError {
  code: string;
  message: string;
}
```

---

## 3. Custom React Hooks (Ready to Use)

### useOrchestrationState Hook

```typescript
import { useEffect, useState, useCallback } from 'react';
import type { OrchestrationState, ApiError } from '../types';

export function useOrchestrationState() {
  const [state, setState] = useState<OrchestrationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const resp = await fetch('/api/v1/state');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();

      if (data.error) {
        setError(data.error);
        setState(null);
      } else {
        setState(data);
        setError(null);
      }
    } catch (err) {
      setError({
        code: 'fetch_error',
        message: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  return { state, loading, error, refetch: fetchState };
}
```

### useIssueDetail Hook

```typescript
import { useEffect, useState } from 'react';
import type { ApiError } from '../types';

export interface IssueDetail {
  issue_identifier: string;
  issue_id: string;
  status: 'running' | 'retrying';
  workspace: {
    path: string;
    host: string;
  };
  attempts: {
    restart_count: number;
    current_retry_attempt: number;
  };
  running: any;
  retry: any;
  logs: {
    codex_session_logs: any[];
  };
  recent_events: any[];
  last_error: string | null;
  tracked: Record<string, any>;
}

export function useIssueDetail(issueId: string) {
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const resp = await fetch(`/api/v1/${issueId}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();

        if (data.error) {
          setError(data.error);
          setDetail(null);
        } else {
          setDetail(data);
          setError(null);
        }
      } catch (err) {
        setError({
          code: 'fetch_error',
          message: err instanceof Error ? err.message : 'Unknown error'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [issueId]);

  return { detail, loading, error };
}
```

### useRealTimeUpdates Hook (Polling)

```typescript
import { useEffect, useRef } from 'react';

export function useRealTimeUpdates(
  onUpdate: () => void,
  intervalMs: number = 2000
) {
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const poll = () => {
      onUpdate();
      timeoutRef.current = setTimeout(poll, intervalMs);
    };

    // Start polling
    timeoutRef.current = setTimeout(poll, intervalMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [onUpdate, intervalMs]);
}
```

### useRealTimeUpdates Hook (SSE)

```typescript
import { useEffect } from 'react';

export function useRealTimeUpdatesSse(onUpdate: () => void) {
  useEffect(() => {
    const eventSource = new EventSource('/api/v1/events');

    const handleUpdate = () => {
      onUpdate();
    };

    eventSource.addEventListener('observability_updated', handleUpdate);

    return () => {
      eventSource.removeEventListener('observability_updated', handleUpdate);
      eventSource.close();
    };
  }, [onUpdate]);
}
```

---

## 4. Utility Functions (Ready to Use)

### Format Timestamps

```typescript
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString();
}

export function formatTimeAgo(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return formatTimestamp(iso);
}

export function formatRuntime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
```

### Format Numbers

```typescript
export function formatInt(num: number): string {
  return num.toLocaleString('en-US');
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(1)}M`;
}
```

### Status Badge Styling

```typescript
export function getStateBadgeClass(state: string): string {
  const baseClasses = 'px-2 py-1 rounded text-sm font-medium';

  switch (state) {
    case 'in_progress':
      return `${baseClasses} bg-blue-100 text-blue-900`;
    case 'completed':
      return `${baseClasses} bg-green-100 text-green-900`;
    case 'failed':
      return `${baseClasses} bg-red-100 text-red-900`;
    case 'retrying':
      return `${baseClasses} bg-yellow-100 text-yellow-900`;
    default:
      return `${baseClasses} bg-gray-100 text-gray-900`;
  }
}
```

---

## 5. Minimal React Components

### MetricCard Component

```typescript
interface MetricCardProps {
  label: string;
  value: string | number;
  detail?: string;
  className?: string;
}

export function MetricCard({
  label,
  value,
  detail,
  className
}: MetricCardProps) {
  return (
    <div className={`p-4 bg-white rounded-lg shadow ${className || ''}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-3xl font-bold mt-1 text-gray-900">{value}</p>
      {detail && <p className="text-xs text-gray-500 mt-1">{detail}</p>}
    </div>
  );
}
```

### RunningSessionRow Component

```typescript
import type { RunningEntry } from '../types';
import { formatTimeAgo, formatRuntime, formatInt } from '../utils';

interface RunningSessionRowProps {
  entry: RunningEntry;
  onClick?: () => void;
}

export function RunningSessionRow({ entry, onClick }: RunningSessionRowProps) {
  return (
    <tr
      onClick={onClick}
      className="border-t cursor-pointer hover:bg-gray-50"
    >
      <td className="px-4 py-2 font-mono text-sm">{entry.issue_identifier}</td>
      <td className="px-4 py-2">
        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-900 rounded">
          {entry.state}
        </span>
      </td>
      <td className="px-4 py-2 text-xs text-gray-600">{entry.session_id}</td>
      <td className="px-4 py-2 text-sm">
        {formatRuntime(
          Math.floor(
            (new Date(entry.last_event_at).getTime() -
             new Date(entry.started_at).getTime()) / 1000
          )
        )} / {entry.turn_count}
      </td>
      <td className="px-4 py-2 text-xs text-gray-500">
        {formatTimeAgo(entry.last_event_at)}
      </td>
      <td className="px-4 py-2 text-sm font-mono">
        {formatInt(entry.tokens.total_tokens)}
      </td>
    </tr>
  );
}
```

---

## 6. CSS Color Scheme (Current Design)

### CSS Variables (Use These)

```css
:root {
  --page: #f7f7f8;
  --page-soft: #fbfbfc;
  --page-deep: #ececf1;
  --card: rgba(255, 255, 255, 0.94);
  --card-muted: #f3f4f6;
  --ink: #202123;
  --muted: #6e6e80;
  --line: #ececf1;
  --line-strong: #d9d9e3;
  --accent: #10a37f;
  --accent-ink: #0f513f;
  --accent-soft: #e8faf4;
  --danger: #b42318;
  --danger-soft: #fef3f2;
  --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.05);
  --shadow-lg: 0 20px 50px rgba(15, 23, 42, 0.08);
}
```

### Tailwind Equivalent

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    colors: {
      background: '#f7f7f8',
      'background-soft': '#fbfbfc',
      'background-deep': '#ececf1',
      card: 'rgba(255, 255, 255, 0.94)',
      'card-muted': '#f3f4f6',
      text: '#202123',
      'text-muted': '#6e6e80',
      border: '#ececf1',
      'border-strong': '#d9d9e3',
      accent: '#10a37f',
      'accent-text': '#0f513f',
      'accent-light': '#e8faf4',
      danger: '#b42318',
      'danger-light': '#fef3f2',
    }
  }
};
```

---

## 7. Project Setup Steps

### 1. Initialize Vite + React

```bash
cd elixir
npm create vite@latest assets -- --template react-ts
cd assets
npm install
```

### 2. Configure Vite Output

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../priv/static',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/vendor': 'http://localhost:4000',
    }
  }
})
```

### 3. Create React SPA Entry Point

**assets/src/main.tsx:**
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

### 4. Build & Serve

```bash
# Build React
cd assets && npm run build

# Test with Symphony
cd ..
./bin/symphony --port 4000 ./WORKFLOW.md
```

### 5. Visit Dashboard
```
http://localhost:4000
```

---

## 8. Common Tasks

### Add New Metric Card

```typescript
// In DashboardPage.tsx
<MetricCard
  label="New Metric"
  value={data.new_value}
  detail="Description"
/>
```

### Add New Table Column

```typescript
// In RunningSessionsTable.tsx
<th className="px-4 py-2 text-left text-xs font-medium">New Column</th>
{/* In map function: */}
<td className="px-4 py-2">{entry.new_field}</td>
```

### Handle API Errors

```typescript
if (error) {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded">
      <p className="font-bold text-red-900">{error.code}</p>
      <p className="text-sm text-red-800">{error.message}</p>
    </div>
  );
}
```

### Format Token Display

```typescript
import { formatTokens } from '../utils';

<span>{formatTokens(entry.tokens.total_tokens)}</span>
```

---

## 9. Development Workflow

### Local Development

```bash
# Terminal 1: Start Elixir backend
cd elixir
./bin/symphony --port 4000 ./WORKFLOW.md

# Terminal 2: Start React dev server
cd elixir/assets
npm run dev

# Browser: http://localhost:5173 (Vite dev server)
# Proxies to http://localhost:4000 for API
```

### Building for Production

```bash
cd elixir/assets
npm run build

cd ..
./bin/symphony --port 4000 ./WORKFLOW.md

# Visit http://localhost:4000
# React bundle served from priv/static/
```

---

## 10. Troubleshooting

### "Cannot find module" errors
```bash
cd elixir/assets
npm install  # Ensure deps installed
npm run build
```

### CORS errors
- Vite proxy handles it in dev (`localhost:5173` → `localhost:4000`)
- In production, both served from same origin

### Stale API responses
- Add `?t=${Date.now()}` to API URL (cache-busting)
- Or configure fetch options: `cache: 'no-store'`

### Real-time updates not working
- Check `/api/v1/events` endpoint (if using SSE)
- Or use polling with `useRealTimeUpdates` hook

---

## 11. Key Files to Reference

| File | What to Do |
|------|-----------|
| `elixir/lib/symphony_elixir_web/presenter.ex` | Understand API shapes |
| `elixir/priv/static/dashboard.css` | Understand current design |
| `elixir/lib/symphony_elixir_web/live/dashboard_live.ex` | See what to replicate |
| `/REACT_INTEGRATION_PLAN.md` | Full integration strategy |
| `/ARCHITECTURE.md` | Deep technical details |

---

## 12. Deploy to Production

### Option 1: Bundle with Elixir (Recommended)

```bash
# Build React
cd elixir/assets && npm run build

# Create release
cd ..
mix release

# Deploy bin/symphony binary
```

### Option 2: Separate Deployment

```bash
# Build React
npm run build

# Deploy frontend to CDN (Vercel, Netlify, etc.)
# Update backend `/` route to redirect to CDN

# Deploy Elixir backend separately
```

---

**You're ready to start! Begin with Section 7 (Project Setup Steps)**
