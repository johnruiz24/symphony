# ⚡ Quick Start - Symphony Frontend POC

**TL;DR:** The system is running. Open these in order:

## 🚀 Right Now

### 1. Open the Demo Guide (START HERE)
```bash
open demo/LIVE_DEMO.html
```
This opens in your browser with full instructions and live links.

### 2. Open the Frontend UI
```bash
open http://localhost:3000
```
You'll see:
- **Kanban board** with 16 test tasks
- **3 agents** (agent-alpha, agent-beta, agent-gamma)
- **Create task form** at the top
- **Real-time updates** as you make changes

### 3. Try Creating a Task
1. Fill in the form at the top of the board
2. Click "Create Task"
3. Watch it appear on the board in real-time
4. All other browsers viewing the same page will see it instantly

## 🎮 What You Can Do

- **Create tasks** - Fill form, click button
- **Drag tasks** - Move between status columns (Backlog → Done)
- **Assign to agents** - Drag task onto an agent to assign
- **Watch updates** - Open DevTools (F12) → Network → XHR to see requests

## ✅ What's Working

- ✅ **Backend API** - 9 endpoints responding
- ✅ **Frontend UI** - React components rendering
- ✅ **Real-time SSE** - Events streaming from backend
- ✅ **Drag-drop** - Task assignment working
- ✅ **Data persistence** - 16 test tasks in memory
- ✅ **Error handling** - Graceful failures

## 🔍 Verify It's Working

Run this to check everything:
```bash
# Backend health
curl http://localhost:4000/api/v1/health | jq

# List tasks
curl http://localhost:4000/api/v1/tasks | jq '.data | length'

# Frontend serving
curl http://localhost:3000 | head -1
```

All should respond successfully.

## 📊 If You Want Details

- **Architecture:** `demo/README.md`
- **System Status:** `SYSTEM_STATUS.md`
- **Full Guide:** `demo/LIVE_DEMO.html`

## 🎯 The Point

**No screenshots. No fake dashboards. No fake demos.**

Everything you see is the actual running system.

- Open http://localhost:3000 → See the real UI
- Create a task → See it update in real-time
- Watch DevTools → See actual HTTP requests
- Check the backend → 9 working API endpoints

That's the demo. It's live. It's real. Go interact with it.

---

**Next step:** `open http://localhost:3000`
