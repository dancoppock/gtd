import cors from "@fastify/cors";
import Fastify from "fastify";

import { registerBoardRoutes } from "./routes/boards.js";
import { registerTicketRoutes } from "./routes/tickets.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: true,
  });

  app.get("/health", async () => ({
    ok: true,
  }));

  app.register(registerBoardRoutes, { prefix: "/api" });
  app.register(registerTicketRoutes, { prefix: "/api" });

  return app;
}
