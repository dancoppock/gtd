# AGENTS.md

## Purpose

This file is a lightweight orientation index for coding agents working in this repo.
Detailed project knowledge should live in the canonical docs rather than being duplicated here.

## Project At A Glance

- browser-based kanban/todo app
- `apps/web`: React frontend
- `apps/api`: Fastify API with SQLite persistence
- `packages/contracts`: shared Zod schemas and TypeScript types

## Read These First

- [README.md](/Users/dcoppock/Sync/Work/Projects/gtd/README.md): repo overview, stack, routes, run/test commands
- [docs/architecture.md](/Users/dcoppock/Sync/Work/Projects/gtd/docs/architecture.md): current architecture and domain model
- [docs/onboarding.md](/Users/dcoppock/Sync/Work/Projects/gtd/docs/onboarding.md): setup, dependency install notes, troubleshooting
- [apps/web/README.md](/Users/dcoppock/Sync/Work/Projects/gtd/apps/web/README.md): frontend responsibilities and interaction model

## Code Entry Points

- [packages/contracts/src/index.ts](/Users/dcoppock/Sync/Work/Projects/gtd/packages/contracts/src/index.ts): shared contracts and constants
- [apps/api/src/db/client.ts](/Users/dcoppock/Sync/Work/Projects/gtd/apps/api/src/db/client.ts): SQLite bootstrap and migration logic
- [apps/api/src/repositories/sqlite-board-store.ts](/Users/dcoppock/Sync/Work/Projects/gtd/apps/api/src/repositories/sqlite-board-store.ts): main persistence logic
- [apps/api/src/app.test.ts](/Users/dcoppock/Sync/Work/Projects/gtd/apps/api/src/app.test.ts): API behavior coverage
- [apps/web/src/routes/BoardPage.tsx](/Users/dcoppock/Sync/Work/Projects/gtd/apps/web/src/routes/BoardPage.tsx): board page orchestration
- [apps/web/src/routes/BoardEditPage.tsx](/Users/dcoppock/Sync/Work/Projects/gtd/apps/web/src/routes/BoardEditPage.tsx): board create/edit flow
- [apps/web/src/features/board/drag.ts](/Users/dcoppock/Sync/Work/Projects/gtd/apps/web/src/features/board/drag.ts): drag/reorder behavior
- [e2e/board.spec.ts](/Users/dcoppock/Sync/Work/Projects/gtd/e2e/board.spec.ts): main browser smoke coverage

## Agent Notes

- prefer the docs above as the source of truth; if behavior changes, update those docs rather than expanding this file
- do not commit `apps/api/data/gtd.sqlite`; it is runtime state
- installs in this environment typically require VPN plus `proxyOn` in the current terminal
- stable local ports are `3000` for web and `3001` for API

## Current Cautions

- the built-in system board is special-cased behavior; do not assume it behaves like a regular configurable board
- ticket ordering is global via `uiOrder`, including when reordering filtered subsets
- Playwright CI wiring is still not documented as fully automated infrastructure
