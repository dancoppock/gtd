import {
  listLabelsResponseSchema,
  updateLabelInputSchema,
} from "@gtd/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { boardStore as defaultBoardStore, type BoardStore } from "../repositories/board-store.js";

const labelIdParamsSchema = z.object({
  labelId: z.string().min(1),
});

function normalizeLabelName(name: string) {
  return name.trim().toLowerCase();
}

function notFound(message: string) {
  return { message };
}

function conflict(message: string) {
  return { message };
}

type LabelRouteOptions = {
  boardStore?: BoardStore;
};

export const registerLabelRoutes: FastifyPluginAsync<LabelRouteOptions> = async (app, options) => {
  const boardStore = options.boardStore ?? defaultBoardStore;

  app.get("/labels", async () => {
    return listLabelsResponseSchema.parse({
      labels: boardStore.listAllLabels(),
    });
  });

  app.patch("/labels/:labelId", async (request, reply) => {
    const { labelId } = labelIdParamsSchema.parse(request.params);
    const input = updateLabelInputSchema.parse(request.body);
    const existingLabel = boardStore.getLabelById(labelId);

    if (!existingLabel) {
      return reply.status(404).send(notFound("Label not found"));
    }

    const nextNormalizedName = normalizeLabelName(input.name);
    const conflictingLabel = boardStore.listAllLabels().find((label) =>
      label.id !== labelId && label.normalizedName === nextNormalizedName,
    );

    if (conflictingLabel) {
      return reply.status(409).send(conflict("Label name already exists"));
    }

    const updatedLabel = boardStore.updateLabel(labelId, input);

    if (!updatedLabel) {
      return reply.status(404).send(notFound("Label not found"));
    }

    return updatedLabel;
  });

  app.delete("/labels/:labelId", async (request, reply) => {
    const { labelId } = labelIdParamsSchema.parse(request.params);
    const didDelete = boardStore.deleteLabel(labelId);

    if (!didDelete) {
      return reply.status(404).send(notFound("Label not found"));
    }

    return reply.status(204).send();
  });
};
