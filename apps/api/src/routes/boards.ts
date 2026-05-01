import {
  archiveDoneTicketsResponseSchema,
  boardDetailSchema,
  boardFiltersSchema,
  boardSchema,
  createBoardInputSchema,
  listTicketsResponseSchema,
  updateBoardInputSchema,
} from "@gtd/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { boardStore as defaultBoardStore, type BoardStore } from "../repositories/board-store.js";

const boardIdParamsSchema = z.object({
  boardId: z.string().min(1),
});

const boardSlugParamsSchema = z.object({
  boardSlug: z.string().min(1),
});

const filtersQuerySchema = z.object({
  priority: z.union([z.string(), z.array(z.string())]).optional(),
  label: z.union([z.string(), z.array(z.string())]).optional(),
  q: z.string().optional(),
});

function toArray(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function parseFilters(query: unknown) {
  const parsed = filtersQuerySchema.parse(query);

  return boardFiltersSchema.parse({
    priorities: toArray(parsed.priority),
    labels: toArray(parsed.label),
    q: parsed.q ?? "",
  });
}

function notFound(message: string) {
  return { message };
}

function badRequest(message: string) {
  return { message };
}

function validateUniqueColumnStatuses(statusKeys: string[]) {
  return new Set(statusKeys).size === statusKeys.length;
}

type BoardRouteOptions = {
  boardStore?: BoardStore;
};

export const registerBoardRoutes: FastifyPluginAsync<BoardRouteOptions> = async (app, options) => {
  const boardStore = options.boardStore ?? defaultBoardStore;

  app.get("/boards", async () => {
    return boardSchema.array().parse(boardStore.listBoards());
  });

  app.post("/boards", async (request, reply) => {
    const input = createBoardInputSchema.parse(request.body);

    if (!validateUniqueColumnStatuses(input.columns.map((column) => column.statusKey))) {
      return reply.status(400).send(badRequest("Each board column must map to a unique status"));
    }

    return reply.status(201).send(boardDetailSchema.parse(boardStore.createBoard(input)));
  });

  app.get("/boards/:boardId", async (request, reply) => {
    const { boardId } = boardIdParamsSchema.parse(request.params);
    const board = boardStore.getBoardDetail(boardId);

    if (!board) {
      return reply.status(404).send(notFound("Board not found"));
    }

    return boardDetailSchema.parse(board);
  });

  app.patch("/boards/:boardId", async (request, reply) => {
    const { boardId } = boardIdParamsSchema.parse(request.params);
    const input = updateBoardInputSchema.parse(request.body);

    if (!validateUniqueColumnStatuses(input.columns.map((column) => column.statusKey))) {
      return reply.status(400).send(badRequest("Each board column must map to a unique status"));
    }

    const board = boardStore.updateBoard(boardId, input);

    if (!board) {
      return reply.status(404).send(notFound("Board not found"));
    }

    return boardDetailSchema.parse(board);
  });

  app.delete("/boards/:boardId", async (request, reply) => {
    const { boardId } = boardIdParamsSchema.parse(request.params);
    const board = boardStore.getBoardById(boardId);

    if (!board) {
      return reply.status(404).send(notFound("Board not found"));
    }

    if (board.isSystem) {
      return reply.status(400).send(badRequest("System boards cannot be deleted"));
    }

    boardStore.deleteBoard(boardId);
    return reply.status(204).send();
  });

  app.get("/boards/:boardId/tickets", async (request, reply) => {
    const { boardId } = boardIdParamsSchema.parse(request.params);
    const board = boardStore.getBoardDetail(boardId);

    if (!board) {
      return reply.status(404).send(notFound("Board not found"));
    }

    const filters = parseFilters(request.query);
    const tickets = boardStore.listTickets(boardId, filters);

    return listTicketsResponseSchema.parse({
      board,
      filters,
      tickets,
    });
  });

  app.get("/boards/slug/:boardSlug", async (request, reply) => {
    const { boardSlug } = boardSlugParamsSchema.parse(request.params);
    const board = boardStore.getBoardBySlug(boardSlug);

    if (!board) {
      return reply.status(404).send(notFound("Board not found"));
    }

    const detail = boardStore.getBoardDetail(board.id);
    if (!detail) {
      return reply.status(404).send(notFound("Board not found"));
    }

    return boardDetailSchema.parse(detail);
  });

  app.get("/boards/slug/:boardSlug/tickets", async (request, reply) => {
    const { boardSlug } = boardSlugParamsSchema.parse(request.params);
    const board = boardStore.getBoardBySlug(boardSlug);

    if (!board) {
      return reply.status(404).send(notFound("Board not found"));
    }

    const detail = boardStore.getBoardDetail(board.id);
    if (!detail) {
      return reply.status(404).send(notFound("Board not found"));
    }

    const filters = parseFilters(request.query);
    const tickets = boardStore.listTickets(board.id, filters);

    return listTicketsResponseSchema.parse({
      board: detail,
      filters,
      tickets,
    });
  });

  app.post("/boards/:boardId/archive-done", async (request, reply) => {
    const { boardId } = boardIdParamsSchema.parse(request.params);
    const result = boardStore.archiveDoneTickets(boardId);

    if (!result) {
      return reply.status(404).send(notFound("Board not found"));
    }

    return archiveDoneTicketsResponseSchema.parse(result);
  });
};
