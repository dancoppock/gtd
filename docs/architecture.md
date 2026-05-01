# Architecture

## Overview

The app is a small monorepo with a browser frontend, a local API, and a shared contracts package:

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
│           └── routes
├── docs
├── packages
│   └── contracts
└── e2e
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
- SQLite via `better-sqlite3`
- Drizzle schema/bootstrap files
- Zod

### Testing

- Vitest for unit tests across the workspace
- `happy-dom` for frontend tests
- disposable SQLite databases for backend repository tests
- Fastify route tests via `app.inject()`
- Playwright for browser smoke tests

## Core Domain Model

### Ticket

- global across the whole app
- has `statusKey`: `todo | in_progress | done`
- has a single global `uiOrder`
- has many labels
- can be archived

### Label

- global across the whole app
- unique by normalized name
- can be attached to tickets
- can also be used in board filters

### Board

- a saved view over global tickets
- has metadata: name, description, slug, `isSystem`
- owns columns
- can optionally filter visible tickets by one or more labels

### Column

- belongs to one board
- has a display name and position
- maps to exactly one `statusKey`
- determines how tickets are grouped on that board

## Persistence Model

The SQLite schema currently stores:

- `boards`
- `columns`
- `labels`
- `board_label_filters`
- `tickets`
- `ticket_labels`

Important implementation detail:

- old single-board data is migrated forward in `apps/api/src/db/client.ts`
- legacy `tickets.board_id` / `tickets.column_id` data is converted into global `tickets.status_key`
- legacy board-scoped labels are merged into global labels by normalized name

## API Shape

### Boards

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

### Labels

- `GET /api/labels`
- `PATCH /api/labels/:labelId`
- `DELETE /api/labels/:labelId`

### Tickets

- `PATCH /api/tickets/:ticketId`
- `DELETE /api/tickets/:ticketId`
- `POST /api/tickets/:ticketId/reposition`

### Test-only

When `GTD_ENABLE_TEST_ROUTES=true`:

- `POST /api/test/reset`

## Ordering Strategy

`uiOrder` is global to all tickets.

Current behavior:

- drag/drop within filtered results reorders against the visible subset only
- moving between columns updates both `statusKey` and `uiOrder`
- new tickets append at the end of the global order

Current implementation strategy:

- large integer gaps starting at `1_000_000`
- midpoint insertion between neighbors
- full rebalance when no numeric gap remains

## Frontend Structure

### Routes

- `BoardPage.tsx`: board view, filters, ticket modal state, drag/drop
- `BoardsPage.tsx`: board list
- `BoardEditPage.tsx`: board create/edit form
- `LabelsPage.tsx`: global label management

### Feature Areas

- `features/board`: API client, DnD helpers, board column rendering
- `features/filters`: collapsible search/filter panel
- `features/layout`: shared header/navigation/theme picker
- `features/tickets`: ticket card, sortable wrapper, modal form

## Current Runtime Notes

- default API URL: `http://127.0.0.1:3001`
- default frontend URL: `http://localhost:3000`
- dev scripts keep those ports stable by stopping existing listeners first
- Playwright uses `apps/api/data/gtd.e2e.sqlite` so local dev data is not touched
