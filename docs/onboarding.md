# Developer Onboarding

This is the shortest path to getting the app running locally in this environment.

## 1. Prerequisites

Expected tools:

- `nvm`
- Node `20.20.0`
- `pnpm`

Confirm Node:

```bash
node -v
```

If needed:

```bash
nvm use 20.20.0
```

## 2. Dependency Install

In this environment, package installs require:

1. VPN connected
2. `proxyOn` run in the current terminal

Typical flow:

```bash
proxyOn
pnpm install
```

## 3. Native SQLite Build

The API uses `better-sqlite3`, which needs a native module.

If the API fails with a missing `better_sqlite3.node` binding, rebuild it like this:

```bash
cd node_modules/.pnpm/better-sqlite3@12.9.0/node_modules/better-sqlite3
npm_config_nodedir=$HOME/.nvm/versions/node/v20.20.0 npm run build-release
```

Then return to the repo root.

## 4. Start the App

From the repo root:

```bash
npm run dev:api
npm run dev:web
```

Or:

```bash
pnpm dev:api
pnpm dev:web
```

## 5. Expected URLs

- API: `http://127.0.0.1:3001`
- Frontend: usually `http://localhost:3000`

If port `3000` is already in use, Vite will move to `3001`, `3002`, or the next available port.

## 6. Useful Checks

Typecheck:

```bash
pnpm typecheck
```

What this does:

- runs the root `typecheck` script across all workspaces
- runs `tsc --noEmit -p tsconfig.json` in `@gtd/api`, `@gtd/web`, and `@gtd/contracts`
- checks TypeScript correctness without generating build output files

API health:

```bash
curl http://127.0.0.1:3001/health
```

Board data:

```bash
curl http://127.0.0.1:3001/api/boards/slug/default/tickets
```

## 7. Common Problems

### Installs hang or fail

Usually means one of these:

- VPN is disconnected
- `proxyOn` was not run in the current terminal
- an old `pnpm` process is still hanging around

Check for stale processes:

```bash
pgrep -af "pnpm install|pnpm --filter @gtd/web add|pnpm --filter @gtd/web dev|tsx watch src/server.ts"
```

### API starts but SQLite binding is missing

Rebuild `better-sqlite3` using the command in section 3.

### Vite starts on the wrong port

That usually just means another process is already using `3000`.

### Server code changes do not seem to apply

There may still be an older API or Vite process running.
Stop the old process and restart the command in a fresh terminal.

## 8. Current Repo Reality

As of now:

- the API is SQLite-backed
- the frontend supports create/edit/filter/drag/reposition
- shared request and response schemas live in `packages/contracts`
- automated tests are not added yet
