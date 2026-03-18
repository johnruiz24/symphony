# Symphony Frontend - Local Development Setup Guide

**Author:** frontend-architect
**Date:** 2026-03-18

---

## Prerequisites

- **Node.js** >= 18.x (LTS recommended)
- **npm** >= 9.x (or pnpm/yarn -- npm shown below)
- **Elixir backend** running on `localhost:4000` (see Elixir setup docs)
- **DynamoDB** accessible (local emulator or AWS mll-sandbox)

## Step 1: Create the frontend project

From the repository root:

```bash
# Create frontend directory
mkdir -p frontend
cd frontend

# Initialize with Vite + React + TypeScript
npm create vite@latest . -- --template react-ts

# Install dependencies
npm install

# Install project-specific dependencies
npm install @tanstack/react-query @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# Install Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Install testing dependencies
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

## Step 2: Configure Vite proxy

Edit `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
```

This proxies all `/api/*` requests to the Elixir backend, eliminating CORS issues during development.

## Step 3: Configure Tailwind

Edit `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#10a37f',
        danger: '#b42318',
        muted: '#6e6e80',
        ink: '#202123',
        page: '#f7f7f8',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

## Step 4: Set up folder structure

```bash
cd src
mkdir -p api hooks types components/{layout,agents,board,tasks,shared} lib styles
```

See `docs/designs/frontend-architecture.md` for the full folder layout and what goes in each directory.

## Step 5: Run the dev server

```bash
# Terminal 1: Start Elixir backend
cd elixir && mix phx.server

# Terminal 2: Start frontend
cd frontend && npm run dev
```

Open `http://localhost:3000` in your browser.

## Step 6: Verify API connectivity

Open browser devtools console:

```javascript
fetch('/api/v1/state').then(r => r.json()).then(console.log)
```

If you see a JSON response with `generated_at`, the proxy is working correctly.

## Common Issues

### "CORS error" when hitting API
- Make sure you're accessing `localhost:3000` (Vite), NOT `localhost:4000` directly
- The Vite proxy handles CORS transparently

### "Connection refused" on API calls
- Ensure Elixir backend is running: `cd elixir && mix phx.server`
- Check it responds: `curl http://localhost:4000/api/v1/state`

### TypeScript path alias `@/` not resolving
- Ensure `tsconfig.json` has the `paths` configuration
- Ensure `vite.config.ts` has the `resolve.alias` configuration
- Restart the Vite dev server after config changes

### Hot Module Replacement (HMR) not working
- Check Vite terminal for errors
- Try `npm run dev -- --force` to clear cache

## Development Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run preview      # Preview production build locally
npm run type-check   # TypeScript type checking
npm run lint         # ESLint
npm run test         # Run tests (Vitest)
npm run test:watch   # Watch mode tests
```
