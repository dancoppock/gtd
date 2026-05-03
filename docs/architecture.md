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
├── docker
│   ├── api.Dockerfile
│   ├── web.Dockerfile
│   └── web
│       └── nginx.conf
├── docker-compose.yml
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

### Container Runtime

- Docker Compose runs the API and web app as separate services.
- `docker/api.Dockerfile` runs the Fastify API with Node `20.20.0`.
- `docker/web.Dockerfile` builds the Vite app and serves static assets from Nginx.
- `docker/web/nginx.conf` proxies `/api` from the web container to the API service on the internal Compose network.
- Compose reads `.env` by default for host port and data-root settings.

## Core Domain Model

### Ticket

- global across the whole app
- has a global `statusKey`
- has a single global `uiOrder`
- has many labels
- can be archived

Statuses are global rather than board-scoped. The seeded defaults are `todo`, `in_progress`, and `done`, but boards can also introduce additional statuses.

### Label

- global across the whole app
- unique by normalized name
- can be attached to tickets
- can also be used in board filters

### Board

- a saved view over global tickets
- has metadata: name, description, slug, `isSystem`
- regular boards own columns
- regular boards can optionally filter visible tickets by one or more labels
- one built-in system board always exists

System board behavior:

- the system board is a special cross-ticket view rather than a normal configurable board
- it always shows exactly two columns: `Active` and `Done`
- `Active` groups all non-completed tickets
- `Done` groups all completed tickets
- its column configuration and label filter are not editable in the board settings UI

### Column

- regular columns belong to one board
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

Runtime database locations:

- local dev default: `apps/api/data/gtd.sqlite`
- Playwright default: `apps/api/data/gtd.e2e.sqlite`
- Docker default: `/opt/docker/gtd/api/data/gtd.sqlite` mounted into the API container at `/data/gtd.sqlite`

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

### Statuses

- `GET /api/statuses`
- `POST /api/statuses`

### Insights

- `GET /api/insights`

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
- `InsightsPage.tsx`: completion metrics dashboard

### Feature Areas

- `features/board`: API client, DnD helpers, board column rendering
- `features/filters`: collapsible search/filter panel
- `features/layout`: shared header/navigation/theme picker
- `features/tickets`: ticket card, sortable wrapper, modal form

Notable board-view behaviors:

- optional swimlanes group tickets by first non-implicit label
- columns can be temporarily collapsed in the UI
- compact cards can be expanded individually
- the system board maps its `Active` / `Done` UI back to real ticket statuses when creating, editing, or dragging tickets

## Current Runtime Notes

- default API URL: `http://127.0.0.1:3001`
- default frontend URL: `http://localhost:3000`
- dev scripts keep those ports stable by stopping existing listeners first
- Playwright uses `apps/api/data/gtd.e2e.sqlite` so local dev data is not touched
- Docker Compose defaults to web port `3000`, API port `3001`, and data root `/opt/docker/gtd`
- Docker host ports and data root can be overridden with `GTD_WEB_PORT`, `GTD_API_PORT`, and `GTD_DOCKER_ROOT`
