import type { FastifyInstance } from "fastify";
import {
  createTicketInputSchema,
  repositionTicketInputSchema,
  updateTicketInputSchema,
} from "@gtd/contracts";
import { z } from "zod";

import { boardStore } from "../repositories/board-store.js";

const boardIdParamsSchema = z.object({
  boardId: z.string().min(1),
});

const ticketIdParamsSchema = z.object({
  ticketId: z.string().min(1),
});

function notFound(message: string) {
  return {
    message,
  };
}

export async function registerTicketRoutes(app: FastifyInstance) {
  app.post("/boards/:boardId/tickets", async (request, reply) => {
    const { boardId } = boardIdParamsSchema.parse(request.params);
    const input = createTicketInputSchema.parse(request.body);
    const ticket = boardStore.createTicket(boardId, input);

    if (!ticket) {
      return reply.status(404).send(notFound("Board not found"));
    }

    return reply.status(201).send(ticket);
  });

  app.patch("/tickets/:ticketId", async (request, reply) => {
    const { ticketId } = ticketIdParamsSchema.parse(request.params);
    const input = updateTicketInputSchema.parse(request.body);
    const ticket = boardStore.updateTicket(ticketId, input);

    if (!ticket) {
      return reply.status(404).send(notFound("Ticket not found"));
    }

    return ticket;
  });

  app.post("/tickets/:ticketId/reposition", async (request, reply) => {
    const { ticketId } = ticketIdParamsSchema.parse(request.params);
    const input = repositionTicketInputSchema.parse(request.body);
    const ticket = boardStore.repositionTicket(ticketId, input);

    if (!ticket) {
      return reply.status(404).send(notFound("Ticket not found"));
    }

    return ticket;
  });
}
