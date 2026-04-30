# Architecture

## Overview

The app is implemented as a small monorepo with a browser frontend and a local API:

```text
.
├── apps
│   ├── api
│   │   ├── data
│   │   │   └── gtd.sqlite
│   │   ├── drizzle
│   │   │   └── 0000_init.sql
│   │   └── src
│   │       ├── db
│   │       ├── repositories
│   │       ├── routes
│   │       └── server.ts
│   └── web
│       └── src
│           ├── app
│           ├── features
│           │   ├── board
│           │   ├── filters
│           │   └── tickets
│           └── routes
├── docs
│   └── architecture.md
├── packages
│   └── contracts
│       └── src
│           └── index.ts
└── package.json
```

## Tooling

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

- Node.js
- Fastify
- TypeScript
- ESLint
- Drizzle ORM
- SQLite via `better-sqlite3`
- Zod

### Shared Package

`packages/contracts` contains the shared schemas and types used by both apps:

- board DTOs
- column DTOs
- label DTOs
- ticket DTOs
- filter schema
- create/update ticket input
- reposition input

### Testing

- Vitest for unit tests across the workspace
- `happy-dom` for frontend tests
- disposable SQLite databases for backend repository tests
- Fastify route tests via `app.inject()` with an injected board store
- React component tests for filter interactions and ticket modal flows
- Playwright end-to-end tests for the main browser flows

## Data Model

### Board

- has many columns
- has many labels
- has many tickets

### Column

- belongs to one board
- is fixed for the default board today
- is still modeled as persisted board-owned data to support future multi-board expansion

### Ticket

- belongs to one board
- belongs to one column
- has many labels through `ticket_labels`
- carries one global `uiOrder`

### Label

- belongs to one board
- is unique per board by normalized name

## Database

The API stores data in `apps/api/data/gtd.sqlite`.

Automation tests use a separate isolated file:

- `apps/api/data/gtd.e2e.sqlite`

The schema is defined in:

- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/0000_init.sql`

On first startup, the API initializes the SQLite schema if needed and seeds:

- board `default`
- columns `Todo`, `In Progress`, `Done`
- a few starter labels
- a few starter tickets

## API Design

### Routes

- `GET /health`
- `GET /api/boards`
- `GET /api/boards/:boardId`
- `GET /api/boards/:boardId/tickets`
- `GET /api/boards/slug/:boardSlug`
- `GET /api/boards/slug/:boardSlug/tickets`
- `POST /api/boards/:boardId/tickets`
- `PATCH /api/tickets/:ticketId`
- `POST /api/tickets/:ticketId/reposition`

When `GTD_ENABLE_TEST_ROUTES=true`, the API also exposes:

- `POST /api/test/reset`

That route is used only by Playwright to reset the isolated E2E database between tests.

### Filters

Ticket list endpoints accept:

- repeated `priority`
- repeated `label`
- `q`

Example:

```text
/api/boards/slug/default/tickets?priority=high&label=frontend&q=modal
```

### Reposition Contract

The frontend sends:

```json
{
  "columnId": "col_done",
  "prevVisibleTicketId": "ticket_3",
  "nextVisibleTicketId": null
}
```

The backend:

1. loads the moved ticket
2. resolves visible neighbors
3. computes a new global `uiOrder`
4. updates `columnId`, `uiOrder`, and `updatedAt`
5. persists the change in a transaction

## Ordering Strategy

`uiOrder` is global to the board, not scoped per column.

Current behavior:

- drag/drop within filtered results reorders against the visible subset only
- moving between columns updates both `columnId` and `uiOrder`
- new tickets append at the end of the board order

Current implementation strategy:

- use large integer gaps, starting at `1_000_000`
- insert between neighbors using midpoint math
- rebalance the board if gaps become too small

## Frontend Structure

### `routes/BoardPage.tsx`

Coordinates:

- route params and search params
- board fetches
- modal state
- drag-and-drop state
- reposition mutations

### `features/board`

- `api.ts`: HTTP functions
- `BoardColumn.tsx`: droppable column and sortable context
- `drag.ts`: drag helpers and neighbor calculation

### `features/filters`

- filter panel with multi-select priorities, labels, and text search

### `features/tickets`

- ticket cards
- sortable ticket wrapper
- create/edit modal form

## Runtime Notes

### Node

The current working Node version for local development is `20.20.0`.

### Vite

The frontend is pinned to Vite `6.4.1`, which matches the current local Node environment more reliably than the latest Vite major in this setup.

### Native SQLite Binding

`better-sqlite3` requires a native module. In this environment, it may require a manual build against the active Node version if the initial install skips or fails native compilation.

## Current Gaps

The main remaining gaps are:

- Playwright CI wiring and artifact retention
- smoother first-time native dependency setup
- stronger drag-and-drop error recovery and UX polish
- additional board features such as delete/archive and label management UI
