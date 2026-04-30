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
- Frontend: `http://localhost:3000`

Root dev commands now enforce fixed ports:

- `pnpm dev:api` stops any existing process on `3001`, then starts the API on `3001`
- `pnpm dev:web` stops any existing process on `3000`, then starts Vite on `3000`
- if another local app is using one of those ports, the matching command will stop it first

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

Lint:

```bash
pnpm lint
```

What this does:

- runs the root `typecheck` script across all workspaces
- runs `tsc --noEmit -p tsconfig.json` in `@gtd/api`, `@gtd/web`, and `@gtd/contracts`
- checks TypeScript correctness without generating build output files

What `pnpm lint` does:

- runs ESLint from the repo root
- checks TypeScript files across the workspace
- enforces a small initial ruleset focused on TypeScript hygiene and React hook safety

Unit tests:

```bash
pnpm test
```

Watch mode:

```bash
pnpm test:watch
```

Coverage:

```bash
pnpm test:coverage
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
- it uses a separate SQLite database file so your normal local data is not touched

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

`pnpm dev:web` should now prevent this by clearing port `3000` first.
If you still see a port issue, the previous process may not have exited cleanly yet.

### Server code changes do not seem to apply

There may still be an older API or Vite process running.
Run `pnpm stop:api` or `pnpm stop:web`, then restart the relevant dev command.

## 8. Current Repo Reality

As of now:

- the API is SQLite-backed
- the frontend supports create/edit/filter/drag/reposition
- shared request and response schemas live in `packages/contracts`
- unit tests are wired with Vitest for the API and web packages
- Playwright smoke tests cover the main browser flows
