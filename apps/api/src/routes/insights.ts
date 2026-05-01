import { insightsResponseSchema } from "@gtd/contracts";
import type { FastifyPluginAsync } from "fastify";

import { boardStore as defaultBoardStore, type BoardStore } from "../repositories/board-store.js";

type InsightRouteOptions = {
  boardStore?: BoardStore;
};

export const registerInsightsRoutes: FastifyPluginAsync<InsightRouteOptions> = async (app, options) => {
  const boardStore = options.boardStore ?? defaultBoardStore;

  app.get("/insights", async () => {
    return insightsResponseSchema.parse(boardStore.getInsights());
  });
};
