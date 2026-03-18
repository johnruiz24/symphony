# Troubleshooting Guide

Common issues and solutions when running Symphony locally.

---

## Startup Issues

### Symphony fails to boot: "Invalid YAML" or "Missing WORKFLOW.md"

**Cause:** Symphony requires a valid `WORKFLOW.md` file with YAML front matter at startup. If the file is missing or the YAML is malformed, the process exits immediately.

**Fix:**
1. Verify the file exists at the path you provided:
   ```bash
   ls -la ./WORKFLOW.md
   ```
2. Validate YAML syntax:
   ```bash
   head -50 WORKFLOW.md   # Check front matter between --- markers
   ```
3. Common YAML issues:
   - Tabs instead of spaces (YAML requires spaces)
   - Missing closing `---` delimiter
   - Unquoted special characters in values

### "Could not start application :symphony_elixir"

**Cause:** The OTP application supervisor failed to start one or more child processes.

**Fix:**
1. Check that all environment variables are set:
   ```bash
   echo $LINEAR_API_KEY    # Should not be empty
   ```
2. Ensure the workspace root directory parent exists:
   ```bash
   mkdir -p ~/code/symphony-workspaces
   ```
3. Check Elixir/Erlang versions match requirements:
   ```bash
   mise exec -- elixir --version   # Should be ~> 1.19
   ```

### escript build fails: "undefined function" or compilation errors

**Cause:** Dependencies not fetched, or Elixir version mismatch.

**Fix:**
```bash
cd elixir
mise exec -- mix deps.get
mise exec -- mix compile --force
mise exec -- mix build
```

---

## Tracker Connection Issues

### "Linear API key is invalid" or 401 errors

**Cause:** The `LINEAR_API_KEY` environment variable is missing, expired, or incorrect.

**Fix:**
1. Generate a new key in Linear: Settings > Security & access > Personal API keys
2. Set the variable:
   ```bash
   export LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
3. Verify it works:
   ```bash
   curl -H "Authorization: Bearer $LINEAR_API_KEY" \
     https://api.linear.app/graphql \
     -d '{"query":"{ viewer { id } }"}'
   ```

### "Project not found" or empty poll results

**Cause:** The `project_slug` in `WORKFLOW.md` does not match any project in your Linear workspace.

**Fix:**
1. Find the correct slug: right-click the project in Linear, copy URL
2. The slug is the last path segment (e.g., `my-project-a1b2c3d4`)
3. Update `WORKFLOW.md`:
   ```yaml
   tracker:
     kind: linear
     project_slug: "correct-project-slug"
   ```

### Jira connection fails

**Cause:** Incorrect endpoint, credentials, or project key.

**Fix:**
1. Verify endpoint format: `https://<your-org>.atlassian.net` (no trailing slash)
2. API key format must be `email:api_token`:
   ```yaml
   tracker:
     kind: jira
     endpoint: https://myorg.atlassian.net
     api_key: user@example.com:your_api_token
     project_slug: PROJ
   ```
3. Generate an API token at: https://id.atlassian.com/manage/api-tokens

---

## Agent / Codex Issues

### "codex: command not found"

**Cause:** The Codex CLI is not installed or not in PATH.

**Fix:**
1. Install Codex CLI following OpenAI documentation
2. Verify it's available:
   ```bash
   which codex
   codex --version
   ```
3. If using a custom path, update `WORKFLOW.md`:
   ```yaml
   codex:
     command: /full/path/to/codex app-server
   ```

### Agent keeps retrying with exponential backoff

**Cause:** Agent sessions are failing and entering the retry queue. This is normal for transient failures.

**Diagnosis:**
1. Check the dashboard or API for error details:
   ```bash
   curl http://localhost:4000/api/v1/state | python3 -m json.tool
   ```
2. Look at the `retrying` array for `error` messages
3. Check agent logs under the configured `--logs-root` directory

**Common causes:**
- Codex session timeout (increase `max_turns` in WORKFLOW.md)
- Network issues reaching the coding agent API
- Workspace filesystem permissions

### Agent sessions complete but issue stays "In Progress"

**Cause:** The agent did not transition the issue state (e.g., did not move to "Human Review").

**Fix:**
1. Check the Codex Workpad comment on the Linear issue for blocker notes
2. Verify the agent has the required Linear MCP server or `linear_graphql` tool configured
3. Check that Custom statuses ("Human Review", "Rework", "Merging") exist in your Linear team

---

## Web Dashboard Issues

### Dashboard not loading / connection refused

**Cause:** The HTTP server only starts when `--port` is provided.

**Fix:**
```bash
# Must include --port flag
./bin/symphony ./WORKFLOW.md --port 4000
```

### LiveView not updating in real-time

**Cause:** WebSocket connection failed or browser blocked the connection.

**Fix:**
1. Check browser console for WebSocket errors
2. The endpoint is configured with `check_origin: false`, so CORS should not be an issue
3. Verify JavaScript assets are loading (check Network tab for `/vendor/phoenix_live_view/phoenix_live_view.js`)

### API returns "snapshot_timeout"

**Cause:** The orchestrator GenServer did not respond within the 15-second timeout. This can happen during heavy load or if the orchestrator is blocked.

**Fix:**
1. Wait and retry -- the orchestrator may be processing a large batch
2. Trigger a manual refresh:
   ```bash
   curl -X POST http://localhost:4000/api/v1/refresh
   ```
3. If persistent, check system resources (CPU, memory, file descriptors)

---

## Workspace Issues

### "Permission denied" when creating workspaces

**Cause:** The workspace root directory is not writable.

**Fix:**
```bash
# Check permissions on the workspace root
ls -la ~/code/symphony-workspaces/

# Fix permissions
chmod 755 ~/code/symphony-workspaces/
```

### Workspace `after_create` hook fails

**Cause:** The hook script has errors, missing tools, or network issues.

**Fix:**
1. Test the hook commands manually:
   ```bash
   mkdir /tmp/test-workspace && cd /tmp/test-workspace
   # Run your after_create hook commands here
   git clone --depth 1 https://github.com/your-org/your-repo .
   ```
2. If using `mise` in hooks, ensure the repo is trusted first:
   ```yaml
   hooks:
     after_create: |
       git clone --depth 1 https://github.com/your-org/your-repo .
       cd elixir && mise trust && mise exec -- mix deps.get
   ```

### Workspaces not cleaned up after issue completes

**Cause:** Symphony only cleans workspaces when an issue enters a terminal state (Done, Closed, Cancelled, Duplicate).

**Manual cleanup:**
```bash
# List workspace directories
ls ~/code/symphony-workspaces/

# Remove a specific workspace
rm -rf ~/code/symphony-workspaces/PROJ-42
```

---

## Frontend Issues

### "CORS error" when calling API from the browser

**Cause:** Accessing the frontend directly at `localhost:4000` or making API calls without going through the Vite proxy.

**Fix:**
- Access the frontend at `http://localhost:3000` (Vite dev server), NOT `http://localhost:4000`
- The Vite proxy in `vite.config.ts` routes `/api/*` to the backend and handles CORS transparently

### "Connection refused" on API calls from frontend

**Cause:** The Elixir backend is not running or not started with `--port`.

**Fix:**
1. Start the backend with the port flag:
   ```bash
   cd elixir
   mise exec -- ./bin/symphony ./WORKFLOW.md --port 4000
   ```
2. Verify it responds:
   ```bash
   curl http://localhost:4000/api/v1/state
   ```

### TypeScript path alias `@/` not resolving

**Cause:** Missing or mismatched configuration between `tsconfig.json` and `vite.config.ts`.

**Fix:**
1. Ensure `tsconfig.json` has paths configured:
   ```json
   {
     "compilerOptions": {
       "baseUrl": ".",
       "paths": { "@/*": ["./src/*"] }
     }
   }
   ```
2. Ensure `vite.config.ts` has the matching resolve alias (see Step 3.2 in setup guide)
3. Restart the Vite dev server after config changes

### Hot Module Replacement (HMR) not working

**Cause:** Vite cache is stale or WebSocket connection is blocked.

**Fix:**
```bash
cd frontend
npm run dev -- --force   # Clear Vite cache and restart
```

---

## Build & Test Issues

### `make all` fails at dialyzer

**Cause:** First-time dialyzer run builds the PLT (Persistent Lookup Table), which is slow and may fail on dependency issues.

**Fix:**
```bash
cd elixir
mise exec -- mix deps.get
mise exec -- mix dialyzer --format short
```

The initial PLT build can take several minutes. Subsequent runs are much faster.

### Tests fail with "module not found"

**Cause:** Build artifacts are stale or dependencies changed.

**Fix:**
```bash
cd elixir
mise exec -- mix deps.get
mise exec -- mix compile --force
mise exec -- mix test
```

### E2E test creates orphaned Linear resources

**Cause:** The E2E test (`make e2e`) creates real Linear projects and issues. If the test crashes before cleanup, resources may remain.

**Fix:**
1. Check Linear for projects named with the test team key (default: `SYME2E`)
2. Manually archive or delete test projects/issues
3. The test automatically marks projects as completed on success

---

## SSH Worker Issues

### "Connection refused" to SSH workers

**Cause:** SSH worker hosts are not reachable or not configured.

**Fix:**
1. For local testing, the E2E test uses `docker compose` to start disposable SSH containers
2. For remote hosts:
   ```bash
   export SYMPHONY_LIVE_SSH_WORKER_HOSTS=host1.example.com,host2.example.com
   ```
3. Verify SSH connectivity:
   ```bash
   ssh host1.example.com echo "OK"
   ```

### SSH workers missing Codex auth

**Cause:** SSH workers need access to Codex authentication (typically `~/.codex/auth.json`).

**Fix:**
- For Docker workers: the E2E test mounts `~/.codex/auth.json` into containers
- For remote hosts: ensure `~/.codex/auth.json` exists on each worker host

---

## Environment-Specific Notes

### macOS

- Install mise via Homebrew: `brew install mise`
- Ensure Xcode Command Line Tools are installed: `xcode-select --install`
- If using Homebrew Erlang, set `KERL_CONFIGURE_OPTIONS="--without-javac"` to avoid Java dependency

### Linux

- Install mise via the install script: `curl https://mise.jdx.dev/install.sh | sh`
- Ensure `build-essential`, `autoconf`, `libncurses-dev`, and `libssl-dev` are installed for compiling Erlang

### Docker

- The project includes Docker Compose support for E2E testing SSH workers
- No official production Docker image is provided yet (Symphony is an engineering preview)
