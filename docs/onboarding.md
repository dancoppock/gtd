# Developer Onboarding

This is the shortest path to getting the app running locally in this environment.

## 1. Prerequisites

Expected tools:

- `nvm`
- Node `20.20.0`
- `pnpm`

Activate the project Node version and make sure Corepack exposes `pnpm` for that Node install:

```bash
source ~/.nvm/nvm.sh
nvm use 20.20.0
corepack enable
node -v
pnpm -v
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
The workspace allows the required build scripts for `better-sqlite3` and `esbuild`, so a normal `pnpm install` should build the native pieces.

If the API fails with a missing `better_sqlite3.node` binding, or if the install cannot fetch Node headers through the network/proxy, rebuild it against the local `nvm` Node headers:

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

## 6. Docker Compose Runtime

The repo includes a Docker Compose stack for running the API and built web app as containers.
Compose automatically reads the committed `.env` file:

```bash
GTD_DOCKER_ROOT=/opt/docker/gtd
GTD_WEB_PORT=3000
GTD_API_PORT=3001
GTD_BASIC_AUTH_USER=admin
GTD_BASIC_AUTH_PASSWORD=admin
```

On a Linux server, create the persistent data directory before starting the stack:

```bash
sudo mkdir -p /opt/docker/gtd/api/data
```

Then build and start from the repo root:

```bash
pnpm docker:build
pnpm docker:up
```

The web container serves the app at `http://<server-host>:${GTD_WEB_PORT}` and proxies `/api` to the API container. Nginx protects both the app and proxied `/api` routes with basic auth. The default credentials are `admin` / `admin`; override `GTD_BASIC_AUTH_USER` and `GTD_BASIC_AUTH_PASSWORD` in `.env` before running a real deployment.

The API port is bound to `127.0.0.1:${GTD_API_PORT}` on the Docker host for local checks without exposing an unauthenticated API port remotely.

Override defaults in your shell when needed:

```bash
GTD_WEB_PORT=8080 GTD_API_PORT=8081 GTD_BASIC_AUTH_USER=me GTD_BASIC_AUTH_PASSWORD=secret pnpm docker:up
```

For local Docker Desktop testing on macOS, `/opt` may need to be shared in Docker Desktop settings. A temporary shared path works for local testing:

```bash
mkdir -p /private/tmp/gtd/api/data
GTD_DOCKER_ROOT=/private/tmp/gtd pnpm docker:up
```

Stop the stack with:

```bash
pnpm docker:down
```

## 7. Useful Checks

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

Useful variants:

```bash
pnpm test:e2e:headed
pnpm test:e2e:debug
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

## 8. Current Product Model

- tickets are global
- statuses are global and can be extended
- labels are global
- regular boards are saved views over tickets
- regular board columns map to statuses
- one built-in system board always exists and shows `Active` plus `Done`
- board filters optionally limit tickets by label
- board default labels are separate from filters and optionally apply one label to new tickets
- board swimlane layout defaults to no swimlanes and can be configured to group by label
- board swimlane label priority is stored per board; unprioritized lanes sort by name and unlabelled tickets render last
- ticket ordering is global and persisted through `uiOrder`
- drag/drop on filtered boards reorders against the visible subset only

## 9. Common Problems

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

### Docker Desktop refuses the data mount

Docker Desktop on macOS may reject `/opt/docker/gtd` until `/opt` is added in Docker Desktop file sharing settings.
Use `GTD_DOCKER_ROOT=/private/tmp/gtd` for local smoke tests, or add `/opt/docker/gtd` to shared paths.

### Docker ports are already in use

Override the host ports when starting the stack:

```bash
GTD_WEB_PORT=8080 GTD_API_PORT=8081 pnpm docker:up
```
