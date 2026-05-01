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
pnpm dev:api
pnpm dev:web
```

## 5. Expected URLs

- API: `http://127.0.0.1:3001`
- Frontend: `http://localhost:3000`

Root dev commands enforce fixed ports:

- `pnpm dev:api` stops any existing process on `3001`, then starts the API on `3001`
- `pnpm dev:web` stops any existing process on `3000`, then starts Vite on `3000`

Optional manual stop commands:

```bash
pnpm stop:api
pnpm stop:web
```

## 6. Useful Checks

Typecheck:

```bash
pnpm typecheck
```

What this does:

- runs the root `typecheck` script across all workspaces
- runs `tsc --noEmit -p tsconfig.json` in `@gtd/api`, `@gtd/web`, and `@gtd/contracts`
- checks TypeScript correctness without generating build output files

Lint:

```bash
pnpm lint
```

What this does:

- runs ESLint from the repo root
- checks TypeScript files across the workspace
- enforces the current TypeScript and React hook ruleset

Unit tests:

```bash
pnpm test
```

End-to-end tests:

```bash
pnpm test:e2e
```

Optional Playwright browser install:

```bash
pnpm test:e2e:install
```

Notes:

- the E2E suite uses local Google Chrome by default on this machine
- it boots isolated API and Vite servers automatically
- it uses a separate SQLite database file so normal local data is not touched

API health:

```bash
curl http://127.0.0.1:3001/health
```

Board tickets:

```bash
curl http://127.0.0.1:3001/api/boards/slug/default/tickets
```

Global labels:

```bash
curl http://127.0.0.1:3001/api/labels
```

## 7. Current Product Model

- tickets are global
- labels are global
- boards are saved views over tickets
- board columns map to statuses
- board filters optionally limit tickets by label
- ticket ordering is global and persisted through `uiOrder`
- drag/drop on filtered boards reorders against the visible subset only

## 8. Common Problems

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

### Server code changes do not seem to apply

There may still be an older API or Vite process running.
Run `pnpm stop:api` or `pnpm stop:web`, then restart the relevant dev command.
