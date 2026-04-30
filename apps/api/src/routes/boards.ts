import type { FastifyInstance } from "fastify";
import {
  boardFiltersSchema,
  boardSchema,
  listTicketsResponseSchema,
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
  return {
    message,
  };
}

type BoardRouteOptions = {
  boardStore?: BoardStore;
};

export const registerBoardRoutes: FastifyPluginAsync<BoardRouteOptions> = async (app, options) => {
  const boardStore = options.boardStore ?? defaultBoardStore;

  app.get("/boards", async () => {
    return boardSchema.array().parse(boardStore.listBoards());
  });

  app.get("/boards/:boardId", async (request, reply) => {
    const { boardId } = boardIdParamsSchema.parse(request.params);
    const board = boardStore.getBoardDetail(boardId);

    if (!board) {
      return reply.status(404).send(notFound("Board not found"));
    }

    return board;
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

    return board;
  });

  app.get("/boards/slug/:boardSlug/tickets", async (request, reply) => {
    const { boardSlug } = boardSlugParamsSchema.parse(request.params);
    const board = boardStore.getBoardBySlug(boardSlug);

    if (!board) {
      return reply.status(404).send(notFound("Board not found"));
    }

    const boardDetail = boardStore.getBoardDetail(board.id);
    if (!boardDetail) {
      return reply.status(404).send(notFound("Board not found"));
    }

    const filters = parseFilters(request.query);
    const tickets = boardStore.listTickets(board.id, filters);

    return listTicketsResponseSchema.parse({
      board: boardDetail,
      filters,
      tickets,
    });
  });
};
