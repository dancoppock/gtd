# Web App

This package contains the React frontend for the kanban app.

## Current Responsibilities

- load a board by slug
- keep filters in URL search params
- fetch board data through TanStack Query
- create and edit tickets in modal dialogs
- reorder tickets with dnd-kit
- move tickets across columns and persist the change through the reposition API

## Key Files

- `src/app/App.tsx`: app providers and router mounting
- `src/routes/router.tsx`: route definitions
- `src/routes/BoardPage.tsx`: board page orchestration
- `src/features/board/api.ts`: frontend API helpers
- `src/features/board/BoardColumn.tsx`: droppable sortable column
- `src/features/board/drag.ts`: drag logic and reposition payload building
- `src/features/filters/BoardFilters.tsx`: search and filter controls
- `src/features/tickets/TicketModal.tsx`: create/edit modal form
- `src/features/tickets/SortableTicketCard.tsx`: sortable ticket wrapper

## Current Interaction Model

- each column is a droppable area
- each ticket is sortable within its column
- the board keeps a visible filtered ticket list in memory during drag
- on drop, the frontend computes the moved ticket's visible neighbors
- the frontend calls `POST /api/tickets/:ticketId/reposition`

## Development

Start the frontend from the repo root:

```bash
npm run dev:web
```

Or:

```bash
pnpm dev:web
```

`pnpm dev:web` always frees port `3000` first, then starts Vite on `http://localhost:3000`.
If something else was already bound to that port, it will be stopped before Vite starts.
