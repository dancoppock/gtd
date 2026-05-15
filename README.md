# GTD Kanban App

Browser-based kanban todos app with:

- React + Vite frontend
- Fastify API
- shared Zod contracts
- SQLite persistence

Quick setup help lives in `docs/onboarding.md`.

## Current Architecture

### Monorepo

- `apps/web`: React frontend
- `apps/api`: Fastify API and SQLite persistence
- `packages/contracts`: shared Zod schemas and inferred TypeScript types

### Frontend

- React
- TypeScript
- Vite `6.4.1`
- React Router
- TanStack Query
- dnd-kit
- React Hook Form

The UI currently supports:

- board view by slug
- boards list and board edit/create pages
- pinned board links in the header navigation
- global labels page
- insights dashboard
- theme switching
- swimlane grouping by label
- filtering by priority, labels, and text search
- collapsible filter panel and header panel
- collapsible board columns
- create/edit ticket modals
- inline title editing
- drag/drop reorder within and across columns
- archive of visible done tickets
- optional per-board priority colour stripes on tickets

### Backend

- Node.js
- Fastify
- SQLite via `better-sqlite3`
- Drizzle-managed schema/bootstrap files
- shared request/response validation via Zod

The API persists data in:

- `apps/api/data/gtd.sqlite`

On first run, the API seeds:

- one built-in system board
- system board columns: `Active`, `Done`
- demo labels and tickets

## Data Model

- Tickets are global and carry a global `statusKey` plus a global `uiOrder`
- Labels are global and reusable across all tickets and boards
- Boards are views over tickets
- Boards can be pinned to appear in the header navigation
- Boards can enable or disable ticket priority colour stripes
- Regular boards own a set of columns
- Each regular board column maps to exactly one status
- Statuses are global and can be extended beyond the seeded defaults
- Boards can optionally filter visible tickets by one or more labels
- Boards can also choose one default label that is automatically applied to new tickets created from that board
- One built-in system board always exists and shows all active tickets in `Active` plus all completed tickets in `Done`

## API Routes

- `GET /health`
- `GET /api/boards`
- `POST /api/boards`
- `GET /api/boards/:boardId`
- `PATCH /api/boards/:boardId`
- `DELETE /api/boards/:boardId`
- `GET /api/boards/:boardId/tickets`
- `GET /api/boards/slug/:boardSlug`
- `GET /api/boards/slug/:boardSlug/tickets`
- `POST /api/boards/:boardId/tickets`
- `POST /api/boards/:boardId/archive-done`
- `GET /api/labels`
- `PATCH /api/labels/:labelId`
- `DELETE /api/labels/:labelId`
- `GET /api/statuses`
- `POST /api/statuses`
- `GET /api/insights`
- `PATCH /api/tickets/:ticketId`
- `DELETE /api/tickets/:ticketId`
- `POST /api/tickets/:ticketId/reposition`

Ticket list routes support:

- repeated `priority`
- repeated `label`
- `q` for text search

## Development Setup

Expected local tooling:

- Node `20.20.0`
- `pnpm`

With `nvm`, make sure the active Node install exposes a `pnpm` shim:

```bash
source ~/.nvm/nvm.sh
nvm use 20.20.0
corepack enable
pnpm -v
```

When installing dependencies in this environment:

1. make sure VPN is connected
2. run `proxyOn` in the current terminal
3. run `pnpm install`

The workspace allows the required package build scripts for `better-sqlite3` and `esbuild`.
If the SQLite native binding is still missing after install, rebuild it under the active Node version:

```bash
cd node_modules/.pnpm/better-sqlite3@12.9.0/node_modules/better-sqlite3
npm_config_nodedir=$HOME/.nvm/versions/node/v20.20.0 npm run build-release
```

## Running Locally

From the repo root:

```bash
pnpm dev:api
pnpm dev:web
```

Notes:

- the API listens on `http://127.0.0.1:3001`
- the frontend listens on `http://localhost:3000`
- `pnpm dev:api` stops any existing process on port `3001` before starting Fastify
- `pnpm dev:web` stops any existing process on port `3000` before starting Vite

Optional manual stops:

```bash
pnpm stop:api
pnpm stop:web
```

## Running With Docker Compose

The Docker stack runs the API and web app as separate containers. The web container serves the built React app with Nginx and proxies `/api` to the API container.

Persistent container data is stored under `/opt/docker/gtd`:

- `/opt/docker/gtd/api/data/gtd.sqlite`
- `/opt/docker/gtd/api/data/gtd.sqlite-shm`
- `/opt/docker/gtd/api/data/gtd.sqlite-wal`

Docker Compose reads the committed `.env` file by default:

```bash
GTD_DOCKER_ROOT=/opt/docker/gtd
GTD_WEB_PORT=3000
GTD_API_PORT=3001
GTD_BASIC_AUTH_USER=admin
GTD_BASIC_AUTH_PASSWORD=admin
```

The web container protects the app and proxied `/api` routes with Nginx basic auth.
Override the default credentials in `.env` before running a real deployment.

Override these values in your shell when you need different local ports, credentials, or a different data root:

```bash
GTD_WEB_PORT=8080 GTD_API_PORT=8081 GTD_BASIC_AUTH_USER=me GTD_BASIC_AUTH_PASSWORD=secret pnpm docker:up
```

On the Linux server, create the data directory first:

```bash
sudo mkdir -p /opt/docker/gtd/api/data
```

Then build and start the stack from the repo root:

```bash
pnpm docker:build
pnpm docker:up
```

The app is served at `http://<server-host>:${GTD_WEB_PORT}`. With the default `.env`, that is `http://<server-host>:3000`.
The API port is bound to `127.0.0.1` on the Docker host so remote users go through the authenticated web container.

For local Docker Desktop testing on macOS, `/opt` may need to be added in Docker Desktop's file sharing settings. Alternatively, use a Docker-shared path while keeping the Linux server default unchanged:

```bash
mkdir -p /private/tmp/gtd/api/data
GTD_DOCKER_ROOT=/private/tmp/gtd pnpm docker:up
```

To stop the stack:

```bash
pnpm docker:down
```

## Testing

From the repo root:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

Current automated coverage includes:

- frontend drag/reorder helpers
- React component behavior for filters and ticket modals
- SQLite-backed repository behavior
- Fastify route behavior via `app.inject()`
- Playwright smoke coverage for board load/filter/create/drag plus labels and boards flows
