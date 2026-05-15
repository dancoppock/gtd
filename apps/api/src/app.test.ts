import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SYSTEM_BOARD_ACTIVE_STATUS_KEY,
  SYSTEM_BOARD_DONE_STATUS_KEY,
} from "@gtd/contracts";

import { buildApp } from "./app.js";
import { InMemoryBoardStore } from "./repositories/in-memory-board-store.js";

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
      name: "System Board",
      isDefault: true,
      isPinned: true,
      showPriorityColors: true,
      swimlaneLayout: "none",
      swimlaneLabelOrder: [],
      isSystem: true,
    });
  });

  it("returns board detail by slug", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/boards/slug/default",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "board_default",
      slug: "default",
      isDefault: true,
      isPinned: true,
      showPriorityColors: true,
      swimlaneLayout: "none",
      swimlaneLabelOrder: [],
      columns: [
        expect.objectContaining({ statusKey: SYSTEM_BOARD_ACTIVE_STATUS_KEY, name: "Active" }),
        expect.objectContaining({ statusKey: SYSTEM_BOARD_DONE_STATUS_KEY, name: "Done" }),
      ],
    });
  });

  it("lists the seeded global statuses", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/statuses",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      statuses: [
        expect.objectContaining({ key: "done", name: "Done", category: "completed", isSystem: true }),
        expect.objectContaining({ key: "in_progress", name: "In Progress", category: "active", isSystem: true }),
        expect.objectContaining({ key: "todo", name: "Todo", category: "active", isSystem: true }),
      ],
    });
  });

  it("creates a new global status immediately", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/statuses",
      payload: {
        name: "Blocked",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      key: "blocked",
      name: "Blocked",
      category: "active",
      isSystem: false,
    });
  });

  it("lists labels globally", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/labels",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().labels).toEqual([
      expect.objectContaining({
        normalizedName: "backend",
        activeTicketCount: 2,
        archivedTicketCount: 0,
      }),
      expect.objectContaining({
        normalizedName: "frontend",
        activeTicketCount: 1,
        archivedTicketCount: 0,
      }),
      expect.objectContaining({
        normalizedName: "product",
        activeTicketCount: 2,
        archivedTicketCount: 0,
      }),
    ]);
  });

  it("returns insights for recently completed tickets", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/insights",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      summary: {
        doneToday: 1,
        doneThisWeek: 1,
        doneLastWeek: 0,
      },
      tickets: {
        doneToday: [
          expect.objectContaining({
            id: "ticket_3",
            statusKey: "done",
          }),
        ],
        doneThisWeek: [
          expect.objectContaining({
            id: "ticket_3",
            statusKey: "done",
          }),
        ],
      },
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
      statusKey: "in_progress",
    });
  });

  it("returns system board tickets grouped into active and done columns", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/boards/slug/default/tickets",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().board.columns).toEqual([
      expect.objectContaining({ statusKey: SYSTEM_BOARD_ACTIVE_STATUS_KEY, name: "Active" }),
      expect.objectContaining({ statusKey: SYSTEM_BOARD_DONE_STATUS_KEY, name: "Done" }),
    ]);
    expect(response.json().tickets.map((ticket: { id: string; statusKey: string }) => ticket.id)).toEqual([
      "ticket_1",
      "ticket_2",
      "ticket_3",
    ]);
  });

  it("creates a ticket and returns it with hydrated labels", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/boards/board_default/tickets",
      payload: {
        statusKey: "todo",
        title: "Write route tests",
        description: "Cover the Fastify endpoints with inject.",
        priority: "high",
        labels: ["backend", "qa"],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      statusKey: "todo",
      title: "Write route tests",
      priority: "high",
    });
    expect(response.json().labels.map((label: { normalizedName: string }) => label.normalizedName)).toEqual([
      "backend",
      "qa",
    ]);
  });

  it("creates and edits a board", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: {
        name: "Frontend Work",
        description: "Only frontend-tagged tickets",
        isDefault: false,
        isPinned: false,
        columns: [
          { name: "Todo", statusKey: "todo" },
          { name: "In Progress", statusKey: "in_progress" },
          { name: "Done", statusKey: "done" },
        ],
        filterLabelIds: ["label_frontend", "label_backend"],
        defaultLabelId: "label_frontend",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      slug: "frontend-work",
      isPinned: false,
      showPriorityColors: true,
      swimlaneLayout: "none",
      swimlaneLabelOrder: [],
      filterLabels: [
        expect.objectContaining({ normalizedName: "backend" }),
        expect.objectContaining({ normalizedName: "frontend" }),
      ],
      defaultLabel: expect.objectContaining({ normalizedName: "frontend" }),
    });

    const ticketsResponse = await app.inject({
      method: "GET",
      url: `/api/boards/${createResponse.json().id}/tickets`,
    });

    expect(ticketsResponse.statusCode).toBe(200);
    expect(ticketsResponse.json().tickets.map((ticket: { id: string }) => ticket.id)).toEqual([
      "ticket_1",
      "ticket_2",
      "ticket_3",
    ]);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/boards/${createResponse.json().id}`,
      payload: {
        name: "Frontend Delivery",
        description: "Filtered frontend board",
        isDefault: false,
        isPinned: true,
        showPriorityColors: false,
        swimlaneLayout: "labels",
        swimlaneLabelOrder: ["backend", "frontend"],
        columns: [
          { name: "Doing", statusKey: "in_progress" },
          { name: "Done", statusKey: "done" },
        ],
        filterLabelIds: ["label_frontend", "label_backend"],
        defaultLabelId: "label_backend",
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      name: "Frontend Delivery",
      isPinned: true,
      showPriorityColors: false,
      swimlaneLayout: "labels",
      swimlaneLabelOrder: ["backend", "frontend"],
      columns: [
        expect.objectContaining({ statusKey: "in_progress", name: "Doing" }),
        expect.objectContaining({ statusKey: "done", name: "Done" }),
      ],
      defaultLabel: expect.objectContaining({ normalizedName: "backend" }),
    });

    const swimlaneOrderResponse = await app.inject({
      method: "PATCH",
      url: `/api/boards/${createResponse.json().id}/swimlane-order`,
      payload: {
        labelNames: ["frontend", "backend"],
      },
    });

    expect(swimlaneOrderResponse.statusCode).toBe(200);
    expect(swimlaneOrderResponse.json()).toMatchObject({
      swimlaneLabelOrder: ["frontend", "backend"],
    });
  });

  it("applies a board default label separately from multi-label filters", async () => {
    const createBoardResponse = await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: {
        name: "Engineering Work",
        description: "Frontend or backend tickets",
        isDefault: false,
        isPinned: false,
        columns: [
          { name: "Todo", statusKey: "todo" },
          { name: "In Progress", statusKey: "in_progress" },
          { name: "Done", statusKey: "done" },
        ],
        filterLabelIds: ["label_frontend", "label_backend"],
        defaultLabelId: "label_frontend",
      },
    });

    expect(createBoardResponse.statusCode).toBe(201);

    const createTicketResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${createBoardResponse.json().id}/tickets`,
      payload: {
        statusKey: "todo",
        title: "New engineering task",
        description: "",
        priority: "medium",
        labels: ["ops"],
      },
    });

    expect(createTicketResponse.statusCode).toBe(201);
    expect(createTicketResponse.json().labels.map((label: { normalizedName: string }) => label.normalizedName).sort()).toEqual([
      "frontend",
      "ops",
    ]);
  });

  it("skips a board default label when the ticket already has a board filter label", async () => {
    const createBoardResponse = await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: {
        name: "Engineering Work",
        description: "Frontend or backend tickets",
        isDefault: false,
        isPinned: false,
        columns: [
          { name: "Todo", statusKey: "todo" },
          { name: "In Progress", statusKey: "in_progress" },
          { name: "Done", statusKey: "done" },
        ],
        filterLabelIds: ["label_frontend", "label_backend"],
        defaultLabelId: "label_backend",
      },
    });

    expect(createBoardResponse.statusCode).toBe(201);

    const createTicketResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${createBoardResponse.json().id}/tickets`,
      payload: {
        statusKey: "todo",
        title: "Frontend override task",
        description: "",
        priority: "medium",
        labels: ["frontend"],
      },
    });

    expect(createTicketResponse.statusCode).toBe(201);
    expect(createTicketResponse.json().labels.map((label: { normalizedName: string }) => label.normalizedName)).toEqual([
      "frontend",
    ]);
  });

  it("creates a board with a brand-new status and exposes it globally", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: {
        name: "Support",
        description: "Support workflow",
        isDefault: false,
        columns: [
          { name: "Todo", statusKey: "todo" },
          { name: "Blocked", statusKey: "blocked", statusName: "Blocked" },
          { name: "Done", statusKey: "done" },
        ],
        filterLabelIds: [],
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      columns: [
        expect.objectContaining({ statusKey: "todo", statusName: "Todo", statusCategory: "active" }),
        expect.objectContaining({ statusKey: "blocked", statusName: "Blocked", statusCategory: "active" }),
        expect.objectContaining({ statusKey: "done", statusName: "Done", statusCategory: "completed" }),
      ],
    });

    const statusesResponse = await app.inject({
      method: "GET",
      url: "/api/statuses",
    });

    expect(statusesResponse.statusCode).toBe(200);
    expect(statusesResponse.json()).toEqual({
      statuses: expect.arrayContaining([
        expect.objectContaining({ key: "blocked", name: "Blocked", category: "active", isSystem: false }),
      ]),
    });

    const ticketResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${createResponse.json().id}/tickets`,
      payload: {
        statusKey: "blocked",
        title: "Escalated case",
        description: "Waiting on external dependency.",
        priority: "high",
        labels: [],
      },
    });

    expect(ticketResponse.statusCode).toBe(201);
    expect(ticketResponse.json()).toMatchObject({
      statusKey: "blocked",
      title: "Escalated case",
    });
  });

  it("switches the default board when a board is created as default", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: {
        name: "Operations",
        description: "Ops work",
        isDefault: true,
        columns: [
          { name: "Todo", statusKey: "todo" },
          { name: "In Progress", statusKey: "in_progress" },
          { name: "Done", statusKey: "done" },
        ],
        filterLabelIds: [],
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      slug: "operations",
      isDefault: true,
    });

    const boardsResponse = await app.inject({
      method: "GET",
      url: "/api/boards",
    });

    expect(boardsResponse.statusCode).toBe(200);
    expect(boardsResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "default", isDefault: false }),
        expect.objectContaining({ slug: "operations", isDefault: true }),
      ]),
    );
  });

  it("prevents clearing or deleting the current default board", async () => {
    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/api/boards/board_default",
      payload: {
        name: "My Board",
        description: "Default kanban board",
        isDefault: false,
        columns: [
          { name: "Todo", statusKey: "todo" },
          { name: "In Progress", statusKey: "in_progress" },
          { name: "Done", statusKey: "done" },
        ],
        filterLabelIds: [],
      },
    });

    expect(updateResponse.statusCode).toBe(400);
    expect(updateResponse.json()).toEqual({
      message: "Choose another default board before clearing this one",
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/boards/board_default",
    });

    expect(deleteResponse.statusCode).toBe(400);
    expect(deleteResponse.json()).toEqual({
      message: "System boards cannot be deleted",
    });
  });

  it("returns 409 when renaming a label to an existing global label", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/labels/label_frontend",
      payload: {
        name: "backend",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: "Label name already exists",
    });
  });

  it("archives done tickets so they no longer appear in board responses", async () => {
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/boards/board_default/tickets",
      payload: {
        statusKey: "done",
        title: "Archive me",
        description: "Done work ready for archive.",
        priority: "low",
        labels: ["archive-only"],
      },
    });

    expect(createdResponse.statusCode).toBe(201);

    const archiveResponse = await app.inject({
      method: "POST",
      url: "/api/boards/board_default/archive-done",
    });

    expect(archiveResponse.statusCode).toBe(200);
    expect(archiveResponse.json()).toEqual({
      archivedCount: 2,
    });

    const boardResponse = await app.inject({
      method: "GET",
      url: "/api/boards/slug/default/tickets",
    });

    expect(boardResponse.statusCode).toBe(200);
    expect(boardResponse.json().tickets.map((ticket: { id: string }) => ticket.id)).toEqual([
      "ticket_1",
      "ticket_2",
    ]);

    const labelsResponse = await app.inject({
      method: "GET",
      url: "/api/labels",
    });

    expect(labelsResponse.statusCode).toBe(200);
    expect(labelsResponse.json().labels).toEqual([
      expect.objectContaining({
        normalizedName: "archive-only",
        activeTicketCount: 0,
        archivedTicketCount: 1,
      }),
      expect.objectContaining({
        normalizedName: "backend",
        activeTicketCount: 1,
        archivedTicketCount: 1,
      }),
      expect.objectContaining({
        normalizedName: "frontend",
        activeTicketCount: 1,
        archivedTicketCount: 0,
      }),
      expect.objectContaining({
        normalizedName: "product",
        activeTicketCount: 1,
        archivedTicketCount: 1,
      }),
    ]);
  });
});
