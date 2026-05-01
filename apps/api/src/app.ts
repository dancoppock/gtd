import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";

import { createDefaultBoardStore, type BoardStore } from "./repositories/board-store.js";
import { registerBoardRoutes } from "./routes/boards.js";
import { registerLabelRoutes } from "./routes/labels.js";
import { registerTicketRoutes } from "./routes/tickets.js";

type BuildAppOptions = {
  boardStore?: BoardStore;
  boardStoreFactory?: () => BoardStore;
  logger?: boolean;
  resetState?: () => void;
  testMode?: boolean;
};

function disposeBoardStore(store: BoardStore) {
  store.dispose?.();
}

function createBoardStoreProxy(getBoardStore: () => BoardStore): BoardStore {
  return {
    listBoards: () => getBoardStore().listBoards(),
    getDefaultBoard: () => getBoardStore().getDefaultBoard(),
    getBoardById: (boardId) => getBoardStore().getBoardById(boardId),
    getBoardBySlug: (slug) => getBoardStore().getBoardBySlug(slug),
    getBoardDetail: (boardId) => getBoardStore().getBoardDetail(boardId),
    createBoard: (input) => getBoardStore().createBoard(input),
    updateBoard: (boardId, input) => getBoardStore().updateBoard(boardId, input),
    deleteBoard: (boardId) => getBoardStore().deleteBoard(boardId),
    getLabelById: (labelId) => getBoardStore().getLabelById(labelId),
    listAllLabels: () => getBoardStore().listAllLabels(),
    listTickets: (boardId, filters) => getBoardStore().listTickets(boardId, filters),
    createTicket: (boardId, input) => getBoardStore().createTicket(boardId, input),
    updateLabel: (labelId, input) => getBoardStore().updateLabel(labelId, input),
    deleteLabel: (labelId) => getBoardStore().deleteLabel(labelId),
    updateTicket: (ticketId, input) => getBoardStore().updateTicket(ticketId, input),
    deleteTicket: (ticketId) => getBoardStore().deleteTicket(ticketId),
    archiveDoneTickets: (boardId) => getBoardStore().archiveDoneTickets(boardId),
    repositionTicket: (ticketId, input) => getBoardStore().repositionTicket(ticketId, input),
  };
}

export function buildApp(options: BuildAppOptions = {}) {
  let activeBoardStore =
    options.boardStore ?? options.boardStoreFactory?.() ?? createDefaultBoardStore();
  const boardStore = createBoardStoreProxy(() => activeBoardStore);

  const app = Fastify({
    logger: options.logger ?? true,
  });

  app.register(cors, {
    origin: true,
  });

  app.get("/health", async () => ({
    ok: true,
  }));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: "Validation failed",
        issues: error.issues,
      });
    }

    return reply.send(error);
  });

  if (options.testMode && options.boardStoreFactory && options.resetState) {
    app.post("/api/test/reset", async () => {
      disposeBoardStore(activeBoardStore);
      options.resetState?.();
      activeBoardStore = options.boardStoreFactory?.() ?? activeBoardStore;

      return {
        ok: true,
      };
    });
  }

  app.addHook("onClose", async () => {
    disposeBoardStore(activeBoardStore);
  });

  app.register(registerBoardRoutes, {
    prefix: "/api",
    boardStore,
  });
  app.register(registerLabelRoutes, {
    prefix: "/api",
    boardStore,
  });
  app.register(registerTicketRoutes, {
    prefix: "/api",
    boardStore,
  });

  return app;
}
