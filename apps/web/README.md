# Web App

This package contains the React frontend for the kanban app.

## Current Responsibilities

- route between Home, Boards, Labels, Insights, and individual board pages
- route to the Help page for keyboard shortcuts and board interaction notes
- provide a Home board finder for opening boards and top-level pages
- show pinned board shortcuts in the shared header navigation
- load a board by slug
- keep filters in URL search params
- fetch board data through TanStack Query
- render the built-in system board `Active` / `Done` view
- render configured board swimlanes grouped by label
- persist swimlane label order from the board view
- render ticket descriptions with paragraph breaks and optional priority colour stripes
- support compact/full ticket card view modes and per-ticket expansion
- support board keyboard navigation, Vim-style title cursor movement, tagging, quick moves, quick priority changes, and quick ticket creation
- support temporary column collapse/expand
- support per-board default collapse of the header and search panels
- create and edit tickets in modal dialogs
- convert title hashtags into labels when saving ticket modal changes
- support inline title editing
- reorder tickets with dnd-kit
- move tickets across columns and persist the change through the reposition API
- move tickets across swimlanes and persist the lane-label update

## Key Files

- `src/app/App.tsx`: app providers and router mounting
- `src/routes/router.tsx`: route definitions
- `src/routes/BoardPage.tsx`: board page orchestration
- `src/routes/HomePage.tsx`: board finder landing route
- `src/routes/HelpPage.tsx`: keyboard shortcut reference
- `src/features/board/api.ts`: frontend API helpers
- `src/features/board/BoardFinder.tsx`: searchable board/page opener
- `src/features/board/BoardColumn.tsx`: droppable sortable column
- `src/features/board/drag.ts`: drag logic and reposition payload building
- `src/features/board/keyboard.ts`: board keyboard navigation and move target helpers
- `src/features/board/swimlanes.ts`: swimlane grouping, ordering, and lane-label update helpers
- `src/features/filters/BoardFilters.tsx`: search and filter controls
- `src/features/tickets/TicketModal.tsx`: create/edit modal form
- `src/features/tickets/SortableTicketCard.tsx`: sortable ticket wrapper
- `src/features/tickets/titleTags.ts`: hashtag extraction for ticket labels

## Current Interaction Model

- each column is a droppable area
- each ticket is sortable within its column
- the board keeps a visible filtered ticket list in memory during drag
- on drop, the frontend computes the moved ticket's visible neighbors
- the frontend calls `POST /api/tickets/:ticketId/reposition`
- in swimlane mode, drag/drop can update the label that determines the ticket's lane
- swimlane order changes call `PATCH /api/boards/:boardId/swimlane-order`
- on the system board, the frontend maps `Active` / `Done` UI columns back to real ticket statuses before persisting changes

## Development

Start the frontend from the repo root:

```bash
pnpm dev:web
```

`pnpm dev:web` always frees port `3000` first, then starts Vite on `http://localhost:3000`.
If something else was already bound to that port, it will be stopped before Vite starts.

## Docker Runtime

In the Docker Compose stack, the web app is built with Vite and served by Nginx.
The Nginx container proxies `/api` to the API service on the internal Compose network, so browser requests can continue to use relative `/api` URLs.
