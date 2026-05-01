import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InMemoryBoardStore } from "./repositories/in-memory-board-store.js";
import { buildApp } from "./app.js";

describe("API routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp({
      boardStore: new InMemoryBoardStore(),
      logger: false,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns the health payload", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("lists the seeded boards", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/boards",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({
      id: "board_default",
      slug: "default",
      name: "My Board",
    });
  });

  it("returns board tickets filtered by query params", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/boards/slug/default/tickets?priority=highest&label=backend&q=route",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      filters: {
        priorities: ["highest"],
        labels: ["backend"],
        q: "route",
      },
    });
    expect(response.json().tickets).toHaveLength(1);
    expect(response.json().tickets[0]).toMatchObject({
      id: "ticket_2",
      title: "Build board API route",
      priority: "highest",
    });
  });

  it("returns 404 when a board slug is unknown", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/boards/slug/missing/tickets",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      message: "Board not found",
    });
  });

  it("creates a ticket and returns it with hydrated labels", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/boards/board_default/tickets",
      payload: {
        columnId: "col_todo",
        title: "Write route tests",
        description: "Cover the Fastify endpoints with inject.",
        priority: "high",
        labels: ["backend", "qa"],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      boardId: "board_default",
      columnId: "col_todo",
      title: "Write route tests",
      priority: "high",
    });
    expect(response.json().labels.map((label: { normalizedName: string }) => label.normalizedName)).toEqual([
      "backend",
      "qa",
    ]);
  });

  it("updates an existing ticket", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/tickets/ticket_1",
      payload: {
        title: "Design better ticket modal",
        priority: "low",
        labels: ["frontend"],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "ticket_1",
      title: "Design better ticket modal",
      priority: "low",
    });
    expect(response.json().labels.map((label: { normalizedName: string }) => label.normalizedName)).toEqual([
      "frontend",
    ]);
  });

  it("removes orphan labels from board detail after ticket label updates", async () => {
    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/api/tickets/ticket_1",
      payload: {
        labels: ["backend"],
      },
    });

    expect(updateResponse.statusCode).toBe(200);

    const boardResponse = await app.inject({
      method: "GET",
      url: "/api/boards/slug/default/tickets",
    });

    expect(boardResponse.statusCode).toBe(200);
    expect(boardResponse.json().board.labels.map((label: { normalizedName: string }) => label.normalizedName)).toEqual([
      "backend",
      "product",
    ]);
  });

  it("deletes an existing ticket", async () => {
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/tickets/ticket_1",
    });

    expect(deleteResponse.statusCode).toBe(204);

    const boardResponse = await app.inject({
      method: "GET",
      url: "/api/boards/slug/default/tickets",
    });

    expect(boardResponse.statusCode).toBe(200);
    expect(boardResponse.json().tickets.map((ticket: { id: string }) => ticket.id)).not.toContain("ticket_1");
    expect(boardResponse.json().board.labels.map((label: { normalizedName: string }) => label.normalizedName)).toEqual([
      "backend",
      "product",
    ]);
  });

  it("repositions a ticket into another column", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/tickets/ticket_1/reposition",
      payload: {
        columnId: "col_done",
        prevVisibleTicketId: "ticket_3",
        nextVisibleTicketId: null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "ticket_1",
      columnId: "col_done",
    });
    expect(response.json().uiOrder).toBeGreaterThan(3_000_000);
  });

  it("returns 400 for invalid payloads", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/boards/board_default/tickets",
      payload: {
        columnId: "col_todo",
        title: "",
        description: "",
        priority: "urgent",
        labels: [],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: "Validation failed",
    });
    expect(response.json().issues).toBeInstanceOf(Array);
  });
});
