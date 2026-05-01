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
      columnId: "col_todo",
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

  it("creates labels on demand and reuses existing normalized labels", () => {
    const createdTicket = store.createTicket(boardId, {
      columnId: "col_todo",
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
        "select count(*) as count from labels where board_id = ? and normalized_name = ?",
      )
      .get(boardId, "backend") as { count: number };

    expect(backendCountRow.count).toBe(1);
  });

  it("lists all labels for the board, including archived-only labels", () => {
    store.createTicket(boardId, {
      columnId: "col_done",
      title: "Archive-only label ticket",
      description: "",
      priority: "low",
      labels: ["archive-only"],
    });
    store.archiveDoneTickets(boardId);

    expect(store.listAllLabels(boardId)).toEqual([
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

  it("updates a label name across the board", () => {
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
    expect(store.listAllLabels(boardId).map((label) => label.normalizedName)).toEqual([
      "frontend",
      "product",
    ]);
    expect(
      store.listTickets(boardId, emptyFilters()).flatMap((ticket) => ticket.labels.map((label) => label.normalizedName)),
    ).not.toContain("backend");
  });

  it("replaces label assignments when updating a ticket", () => {
    const updatedTicket = store.updateTicket("ticket_1", {
      labels: ["backend"],
      priority: "low",
    });

    expect(updatedTicket).not.toBeNull();
    expect(updatedTicket?.priority).toBe("low");
    expect(updatedTicket?.labels.map((label) => label.normalizedName)).toEqual(["backend"]);
  });

  it("removes orphan labels after updating a ticket's labels", () => {
    const updatedTicket = store.updateTicket("ticket_1", {
      labels: ["backend"],
    });

    expect(updatedTicket).not.toBeNull();
    expect(store.getBoardDetail(boardId)?.labels.map((label) => label.normalizedName)).toEqual([
      "backend",
      "product",
    ]);
  });

  it("deletes a ticket from the board", () => {
    const didDelete = store.deleteTicket("ticket_1");

    expect(didDelete).toBe(true);
    expect(store.listTickets(boardId, emptyFilters()).map((ticket) => ticket.id)).not.toContain("ticket_1");
    expect(store.getBoardDetail(boardId)?.labels.map((label) => label.normalizedName)).toEqual([
      "backend",
      "product",
    ]);
  });

  it("archives done tickets and hides them from the active board view", () => {
    const createdTicket = store.createTicket(boardId, {
      columnId: "col_done",
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
    expect(store.getBoardDetail(boardId)?.labels.map((label) => label.normalizedName)).toEqual([
      "backend",
      "frontend",
      "product",
    ]);
  });

  it("rebalances the board when a reposition target has no numeric gap left", () => {
    const beforeA = store.createTicket(boardId, {
      columnId: "col_todo",
      title: "Alpha",
      description: "",
      priority: "medium",
      labels: [],
    });
    const beforeB = store.createTicket(boardId, {
      columnId: "col_todo",
      title: "Beta",
      description: "",
      priority: "medium",
      labels: [],
    });
    const beforeC = store.createTicket(boardId, {
      columnId: "col_todo",
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
      columnId: "col_todo",
      prevVisibleTicketId: beforeA!.id,
      nextVisibleTicketId: beforeB!.id,
    });

    expect(movedTicket).not.toBeNull();

    const orderedTodoIds = store
      .listTickets(boardId, emptyFilters())
      .filter((ticket) => ticket.columnId === "col_todo")
      .map((ticket) => ticket.id);

    expect(orderedTodoIds.slice(0, 4)).toEqual([beforeA!.id, beforeC!.id, beforeB!.id, "ticket_1"]);
    expect(movedTicket!.uiOrder).toBeGreaterThan(1_000_000);
    expect(movedTicket!.uiOrder).toBeLessThan(2_000_000);
  });

  it("does not reseed duplicate demo records when the store is instantiated twice", () => {
    const ticketCountBefore = store.listTickets(boardId, emptyFilters()).length;

    const secondStore = new SqliteBoardStore(client);
    const ticketCountAfter = secondStore.listTickets(boardId, emptyFilters()).length;

    expect(ticketCountBefore).toBe(3);
    expect(ticketCountAfter).toBe(3);
  });
});
