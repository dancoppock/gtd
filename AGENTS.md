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
- SQLite via `better-sqlite3`
- Drizzle schema/bootstrap files
- Zod

### Testing

- Vitest
- `happy-dom` for frontend unit tests
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
pnpm dev:api
pnpm dev:web
pnpm stop:api
pnpm stop:web
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

## Current Product Model

- tickets are global and use `statusKey`
- labels are global
- boards are saved ticket views
- board columns map to statuses
- boards can filter by one or more labels
- ticket ordering uses a single global persisted `uiOrder`
- filtered reordering is based on the visible subset only

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
- `PATCH /api/tickets/:ticketId`
- `DELETE /api/tickets/:ticketId`
- `POST /api/tickets/:ticketId/reposition`

## Important Files

- `README.md`: repo overview and run instructions
- `docs/architecture.md`: implemented architecture
- `docs/onboarding.md`: setup and troubleshooting
- `packages/contracts/src/index.ts`: shared contracts
- `apps/api/src/db/client.ts`: SQLite bootstrap and migration logic
- `apps/api/src/repositories/sqlite-board-store.ts`: main persistence logic
- `apps/web/src/routes/BoardPage.tsx`: board page orchestration
- `apps/web/src/routes/BoardEditPage.tsx`: board create/edit page
- `apps/web/src/routes/BoardsPage.tsx`: board list page
- `apps/web/src/routes/LabelsPage.tsx`: global label management page

## Current Gaps

- home-page aggregation beyond the default board is still deferred
- Playwright CI wiring and artifact retention are not in place yet
- native dependency setup is still somewhat manual
