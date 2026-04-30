# GTD Kanban App

This repository contains a browser-based kanban todos app with:

- a React + Vite frontend
- a Fastify API
- shared Zod contracts
- SQLite persistence through Drizzle

Quick setup help lives in:

- `docs/onboarding.md`

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

The board UI supports:

- loading a board by slug
- filtering by priority, labels, and text search
- creating tickets in a modal
- editing tickets in a modal
- dragging tickets within and across columns

### Backend

- Node.js
- Fastify
- Drizzle ORM
- SQLite via `better-sqlite3`
- shared request/response validation via Zod

The API persists data in:

- `apps/api/data/gtd.sqlite`

On first run, the API seeds:

- one board: `default`
- three columns: `Todo`, `In Progress`, `Done`
- demo labels and tickets

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

Ticket list routes support:

- repeated `priority`
- repeated `label`
- `q` for text search

## Development Setup

Expected local tooling:

- Node `20.20.0`
- `pnpm`

When installing dependencies in this environment:

1. make sure VPN is connected
2. run `proxyOn` in the current terminal
3. run `pnpm install`

If the SQLite native binding is missing after install, rebuild it under the active Node version:

```bash
cd node_modules/.pnpm/better-sqlite3@12.9.0/node_modules/better-sqlite3
npm_config_nodedir=$HOME/.nvm/versions/node/v20.20.0 npm run build-release
```

## Running Locally

From the repo root:

```bash
npm run dev:api
npm run dev:web
```

Or with pnpm:

```bash
pnpm dev:api
pnpm dev:web
```

Notes:

- the API listens on `http://127.0.0.1:3001`
- Vite defaults to `http://localhost:3000`
- if `3000` is occupied, Vite will choose the next available port

## Testing

Unit tests use `Vitest`, and browser automation uses `Playwright`.

From the repo root:

```bash
pnpm lint
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm test:e2e
```

`pnpm test:e2e` uses the locally installed Google Chrome browser on this machine.

Current first-pass coverage targets include:

- frontend drag/reorder helpers
- React component behavior for filters and ticket modals
- SQLite-backed board store behavior
- Fastify route behavior via `app.inject()`
- Playwright smoke coverage for load, filter, create, edit, and drag flows

## Verification Status

The current implementation has been verified to:

- pass `pnpm typecheck`
- pass `pnpm test`
- pass `pnpm test:e2e`
- serve the SQLite-backed API
- create tickets through the API
- reposition tickets through the API
- serve the React frontend through Vite
