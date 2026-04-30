# AGENTS.md

## Project Summary

This repo contains a browser-based kanban todos app.

Main packages:

- `apps/web`: React frontend
- `apps/api`: Fastify API with SQLite persistence
- `packages/contracts`: shared Zod schemas and TypeScript types

## Current Stack

### Frontend

- React
- TypeScript
- ESLint
- Vite `6.4.1`
- React Router
- TanStack Query
- dnd-kit
- React Hook Form

### Backend

- Node `20.20.0`
- Fastify
- ESLint
- Drizzle ORM
- SQLite via `better-sqlite3`
- Zod

### Testing

- Vitest
- `jsdom` for frontend unit tests
- disposable SQLite databases for backend repository tests
- Playwright for browser automation smoke tests

## Key Runtime Facts

- API default URL: `http://127.0.0.1:3001`
- Frontend default URL: `http://localhost:3000`
- `pnpm dev:api` frees port `3001` before starting Fastify
- `pnpm dev:web` frees port `3000` before starting Vite
- SQLite database file: `apps/api/data/gtd.sqlite`
- E2E SQLite database file: `apps/api/data/gtd.e2e.sqlite`

## Install Notes

In this environment, dependency installs require:

1. VPN connected
2. `proxyOn` run in the current terminal
3. `pnpm install`

If install commands hang or fail, first verify:

- VPN is connected
- `proxyOn` was run in the same shell
- no stale `pnpm` process is still running

## Native Module Note

`better-sqlite3` may require a manual native build.

If the API fails with a missing `better_sqlite3.node` binding:

```bash
cd node_modules/.pnpm/better-sqlite3@12.9.0/node_modules/better-sqlite3
npm_config_nodedir=$HOME/.nvm/versions/node/v20.20.0 npm run build-release
```

## Common Commands

From the repo root:

```bash
npm run dev:api
npm run dev:web
pnpm stop:api
pnpm stop:web
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

`pnpm typecheck`:

- runs the root `typecheck` script
- runs `tsc --noEmit -p tsconfig.json` in all workspaces
- checks TypeScript correctness without generating build output

`pnpm lint`:

- runs ESLint from the repo root
- checks TypeScript and config files across the workspace
- enforces a minimal first-pass ruleset for TypeScript hygiene and React hook safety

`pnpm test`:

- runs workspace unit tests in `@gtd/api` and `@gtd/web`
- covers drag/reorder helper logic on the frontend
- covers filter and ticket modal component behavior on the frontend
- covers SQLite-backed repository behavior on the backend
- covers Fastify route behavior with `app.inject()`

`pnpm test:e2e`:

- runs Playwright smoke tests against real local API and Vite servers
- resets an isolated SQLite database between tests through a test-only API route
- covers board load, filtering, create, edit, and drag flows

## Current Product Behavior

- one visible board is used for now
- fixed columns: `Todo`, `In Progress`, `Done`
- tickets support multiple labels
- filters support priority, label, and text search
- create and edit flows use modal dialogs
- drag/drop works within and across columns
- ticket ordering uses a single global persisted `uiOrder`
- filtered reordering is based on the visible subset only

## API Routes

- `GET /health`
- `GET /api/boards`
- `GET /api/boards/:boardId`
- `GET /api/boards/:boardId/tickets`
- `GET /api/boards/slug/:boardSlug`
- `GET /api/boards/slug/:boardSlug/tickets`
- `POST /api/boards/:boardId/tickets`
- `PATCH /api/tickets/:ticketId`
- `POST /api/tickets/:ticketId/reposition`

## Important Files

- `README.md`: repo overview and run instructions
- `docs/architecture.md`: implemented architecture
- `docs/onboarding.md`: setup and troubleshooting
- `apps/api/src/repositories/sqlite-board-store.ts`: main persistence logic
- `apps/api/src/db/client.ts`: SQLite bootstrap
- `apps/web/src/routes/BoardPage.tsx`: board page orchestration
- `apps/web/src/features/board/drag.ts`: drag/reposition helpers

## Current Gaps

- Playwright CI wiring and artifact retention are not in place yet
- native dependency setup is still somewhat manual
- drag-and-drop UX could use more polish and failure recovery
