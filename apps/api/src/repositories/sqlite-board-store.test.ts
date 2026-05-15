import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseClient } from "../db/client.js";
import { SqliteBoardStore } from "./sqlite-board-store.js";

const boardId = "board_default";

function emptyFilters() {
  return {
    priorities: [],
    labels: [],
    q: "",
  };
}

describe("SqliteBoardStore", () => {
  let client: DatabaseClient;
  let store: SqliteBoardStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "gtd-api-tests-"));
    client = createDatabaseClient(path.join(tempDir, "test.sqlite"));
    store = new SqliteBoardStore(client);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("filters seeded tickets by priority", () => {
    const tickets = store.listTickets(boardId, {
      ...emptyFilters(),
      priorities: ["highest"],
    });

    expect(tickets.map((ticket) => ticket.id)).toEqual(["ticket_2"]);
  });

  it("filters tickets by normalized label names", () => {
    const tickets = store.listTickets(boardId, {
      ...emptyFilters(),
      labels: ["BACKEND"],
    });

    expect(tickets.map((ticket) => ticket.id)).toEqual(["ticket_2", "ticket_3"]);
  });

  it("escapes text search wildcards so literal percent searches stay precise", () => {
    store.createTicket(boardId, {
      statusKey: "todo",
      title: "Ship 100% test coverage",
      description: "",
      priority: "medium",
      labels: [],
    });

    const tickets = store.listTickets(boardId, {
      ...emptyFilters(),
      q: "%",
    });

    expect(tickets.map((ticket) => ticket.title)).toEqual(["Ship 100% test coverage"]);
  });

  it("creates tickets at the top of a status when requested", () => {
    const createdTicket = store.createTicket(boardId, {
      statusKey: "todo",
      title: "Urgent top ticket",
      description: "",
      priority: "medium",
      labels: [],
      position: "top",
    });

    expect(createdTicket).not.toBeNull();

    const orderedTodoTitles = store
      .listTickets(boardId, emptyFilters())
      .filter((ticket) => ticket.statusKey === "todo")
      .map((ticket) => ticket.title);

    expect(orderedTodoTitles.slice(0, 2)).toEqual(["Urgent top ticket", "Design ticket modal"]);
  });

  it("creates tickets at the bottom of a status by default", () => {
    const createdTicket = store.createTicket(boardId, {
      statusKey: "todo",
      title: "Bottom ticket",
      description: "",
      priority: "medium",
      labels: [],
    });

    expect(createdTicket).not.toBeNull();

    const orderedTodoTitles = store
      .listTickets(boardId, emptyFilters())
      .filter((ticket) => ticket.statusKey === "todo")
      .map((ticket) => ticket.title);

    expect(orderedTodoTitles.at(-1)).toBe("Bottom ticket");
  });

  it("creates labels on demand and reuses existing normalized labels globally", () => {
    const createdTicket = store.createTicket(boardId, {
      statusKey: "todo",
      title: "Create labels",
      description: "",
      priority: "medium",
      labels: ["Backend", "Ops"],
    });

    expect(createdTicket).not.toBeNull();
    expect(createdTicket?.labels.map((label) => label.normalizedName).sort()).toEqual([
      "backend",
      "ops",
    ]);

    const backendCountRow = client.sqlite
      .prepare(
        "select count(*) as count from labels where normalized_name = ?",
      )
      .get("backend") as { count: number };

    expect(backendCountRow.count).toBe(1);
  });

  it("lists all labels globally, including archived-only labels", () => {
    store.createTicket(boardId, {
      statusKey: "done",
      title: "Archive-only label ticket",
      description: "",
      priority: "low",
      labels: ["archive-only"],
    });
    store.archiveDoneTickets(boardId);

    expect(store.listAllLabels()).toEqual([
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

  it("creates boards with label filters and returns matching tickets only", () => {
    const frontendLabelId = store.listAllLabels().find((label) => label.normalizedName === "frontend")?.id;
    expect(frontendLabelId).toBeTruthy();

    const board = store.createBoard({
      name: "Frontend Work",
      description: "Only frontend-tagged tickets",
      isDefault: false,
      isPinned: false,
      showPriorityColors: true,
      columns: [
        { name: "Todo", statusKey: "todo" },
        { name: "In Progress", statusKey: "in_progress" },
        { name: "Done", statusKey: "done" },
      ],
      filterLabelIds: [frontendLabelId!],
    });

    expect(board.filterLabels.map((label) => label.normalizedName)).toEqual(["frontend"]);
    expect(store.listTickets(board.id, emptyFilters()).map((ticket) => ticket.id)).toEqual(["ticket_1"]);
  });

  it("automatically applies board filter labels to newly created tickets", () => {
    const frontendLabelId = store.listAllLabels().find((label) => label.normalizedName === "frontend")?.id;
    expect(frontendLabelId).toBeTruthy();

    const board = store.createBoard({
      name: "Frontend Work",
      description: "Only frontend-tagged tickets",
      isDefault: false,
      isPinned: false,
      showPriorityColors: true,
      columns: [
        { name: "Todo", statusKey: "todo" },
        { name: "In Progress", statusKey: "in_progress" },
        { name: "Done", statusKey: "done" },
      ],
      filterLabelIds: [frontendLabelId!],
    });

    const createdTicket = store.createTicket(board.id, {
      statusKey: "todo",
      title: "New frontend task",
      description: "",
      priority: "medium",
      labels: ["backend"],
    });

    expect(createdTicket).not.toBeNull();
    expect(createdTicket?.labels.map((label) => label.normalizedName).sort()).toEqual([
      "backend",
      "frontend",
    ]);
    expect(store.listTickets(board.id, emptyFilters()).map((ticket) => ticket.title)).toContain(
      "New frontend task",
    );
  });

  it("updates a label name globally", () => {
    const updatedLabel = store.updateLabel("label_frontend", {
      name: "ux",
    });

    expect(updatedLabel).toMatchObject({
      id: "label_frontend",
      name: "ux",
      normalizedName: "ux",
    });
    expect(store.listTickets(boardId, emptyFilters())[0]?.labels.map((label) => label.normalizedName)).toContain("ux");
  });

  it("deletes a label and removes it from all tickets", () => {
    const didDelete = store.deleteLabel("label_backend");

    expect(didDelete).toBe(true);
    expect(store.listAllLabels().map((label) => label.normalizedName)).toEqual([
      "frontend",
      "product",
    ]);
    expect(
      store.listTickets(boardId, emptyFilters()).flatMap((ticket) => ticket.labels.map((label) => label.normalizedName)),
    ).not.toContain("backend");
  });

  it("archives done tickets and hides them from the active board view", () => {
    const createdTicket = store.createTicket(boardId, {
      statusKey: "done",
      title: "Archive me later",
      description: "",
      priority: "low",
      labels: ["archive-only"],
    });

    expect(createdTicket).not.toBeNull();

    const result = store.archiveDoneTickets(boardId);

    expect(result).toEqual({
      archivedCount: 2,
    });
    expect(store.listTickets(boardId, emptyFilters()).map((ticket) => ticket.id)).toEqual([
      "ticket_1",
      "ticket_2",
    ]);
  });

  it("rebalances global order when a reposition target has no numeric gap left", () => {
    const beforeA = store.createTicket(boardId, {
      statusKey: "todo",
      title: "Alpha",
      description: "",
      priority: "medium",
      labels: [],
    });
    const beforeB = store.createTicket(boardId, {
      statusKey: "todo",
      title: "Beta",
      description: "",
      priority: "medium",
      labels: [],
    });
    const beforeC = store.createTicket(boardId, {
      statusKey: "todo",
      title: "Gamma",
      description: "",
      priority: "medium",
      labels: [],
    });

    expect(beforeA && beforeB && beforeC).toBeTruthy();

    client.sqlite.prepare("update tickets set ui_order = ? where id = ?").run(10, beforeA!.id);
    client.sqlite.prepare("update tickets set ui_order = ? where id = ?").run(11, beforeB!.id);
    client.sqlite.prepare("update tickets set ui_order = ? where id = ?").run(100, beforeC!.id);

    const movedTicket = store.repositionTicket(beforeC!.id, {
      statusKey: "todo",
      prevVisibleTicketId: beforeA!.id,
      nextVisibleTicketId: beforeB!.id,
    });

    expect(movedTicket).not.toBeNull();

    const orderedTodoIds = store
      .listTickets(boardId, emptyFilters())
      .filter((ticket) => ticket.statusKey === "todo")
      .map((ticket) => ticket.id);

    expect(orderedTodoIds.slice(0, 4)).toEqual([beforeA!.id, beforeC!.id, beforeB!.id, "ticket_1"]);
    expect(movedTicket!.uiOrder).toBeGreaterThan(1_000_000);
    expect(movedTicket!.uiOrder).toBeLessThan(2_000_000);
  });

  it("does not reseed duplicate demo records when the store is instantiated twice", () => {
    const ticketCountBefore = store.listTickets(boardId, emptyFilters()).length;

    const secondClient = createDatabaseClient(path.join(tempDir, "test.sqlite"));
    const secondStore = new SqliteBoardStore(secondClient);
    const ticketCountAfter = secondStore.listTickets(boardId, emptyFilters()).length;

    secondStore.dispose();

    expect(ticketCountBefore).toBe(3);
    expect(ticketCountAfter).toBe(3);
  });
});
