import { createStatusInputSchema, listStatusesResponseSchema } from "@gtd/contracts";
import type { FastifyPluginAsync } from "fastify";

import { boardStore as defaultBoardStore, type BoardStore } from "../repositories/board-store.js";

type StatusRouteOptions = {
  boardStore?: BoardStore;
};

function statusKeyFromName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "status";
}

function conflict(message: string) {
  return { message };
}

export const registerStatusRoutes: FastifyPluginAsync<StatusRouteOptions> = async (app, options) => {
  const boardStore = options.boardStore ?? defaultBoardStore;

  app.get("/statuses", async () => {
    return listStatusesResponseSchema.parse({
      statuses: boardStore.listStatuses(),
    });
  });

  app.post("/statuses", async (request, reply) => {
    const input = createStatusInputSchema.parse(request.body);
    const nextKey = statusKeyFromName(input.name);
    const conflictingStatus = boardStore.listStatuses().find((status) =>
      status.key === nextKey || status.name.toLowerCase() === input.name.toLowerCase(),
    );

    if (conflictingStatus) {
      return reply.status(409).send(conflict("Status already exists"));
    }

    return reply.status(201).send(boardStore.createStatus(input));
  });
};
