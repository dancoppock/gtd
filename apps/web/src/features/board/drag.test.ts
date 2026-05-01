import type { Column, Ticket } from "@gtd/contracts";
import { describe, expect, it } from "vitest";

import {
  buildRepositionInput,
  findColumnId,
  haveSameTicketLayout,
  moveTicket,
} from "./drag";

const boardId = "board_test";
const timestamp = "2026-04-30T00:00:00.000Z";

const columns: Column[] = [
  {
    id: "col_todo",
    boardId,
    key: "todo",
    name: "Todo",
    position: 0,
  },
  {
    id: "col_in_progress",
    boardId,
    key: "in_progress",
    name: "In Progress",
    position: 1,
  },
  {
    id: "col_done",
    boardId,
    key: "done",
    name: "Done",
    position: 2,
  },
];

function makeTicket(id: string, columnId: string, uiOrder: number): Ticket {
  return {
    id,
    boardId,
    columnId,
    title: `Ticket ${id}`,
    description: "",
    priority: "medium",
    uiOrder,
    labels: [],
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("board drag helpers", () => {
  it("resolves a column id for both column and ticket drag targets", () => {
    const tickets = [
      makeTicket("ticket_1", "col_todo", 1_000_000),
      makeTicket("ticket_2", "col_done", 2_000_000),
    ];

    expect(findColumnId(columns, tickets, "col_done")).toBe("col_done");
    expect(findColumnId(columns, tickets, "ticket_1")).toBe("col_todo");
    expect(findColumnId(columns, tickets, "missing")).toBeNull();
  });

  it("reorders tickets within the same column", () => {
    const tickets = [
      makeTicket("ticket_1", "col_todo", 1_000_000),
      makeTicket("ticket_2", "col_todo", 2_000_000),
      makeTicket("ticket_3", "col_done", 3_000_000),
    ];

    const nextTickets = moveTicket(columns, tickets, "ticket_2", "ticket_1");

    expect(nextTickets.map((ticket) => ticket.id)).toEqual(["ticket_2", "ticket_1", "ticket_3"]);
    expect(haveSameTicketLayout(tickets, nextTickets)).toBe(false);
  });

  it("moves a ticket into another column and appends when dropped on the column body", () => {
    const tickets = [
      makeTicket("ticket_1", "col_todo", 1_000_000),
      makeTicket("ticket_2", "col_todo", 2_000_000),
      makeTicket("ticket_3", "col_done", 3_000_000),
    ];

    const nextTickets = moveTicket(columns, tickets, "ticket_1", "col_done");

    expect(nextTickets.map((ticket) => `${ticket.id}:${ticket.columnId}`)).toEqual([
      "ticket_2:col_todo",
      "ticket_3:col_done",
      "ticket_1:col_done",
    ]);
  });

  it("builds a reposition payload from the current visible order inside a column", () => {
    const tickets = [
      makeTicket("ticket_1", "col_todo", 1_000_000),
      makeTicket("ticket_2", "col_todo", 2_000_000),
      makeTicket("ticket_3", "col_todo", 3_000_000),
    ];

    expect(buildRepositionInput(columns, tickets, "ticket_2")).toEqual({
      columnId: "col_todo",
      prevVisibleTicketId: "ticket_1",
      nextVisibleTicketId: "ticket_3",
    });
  });

  it("uses only the visible subset when building reposition input for filtered boards", () => {
    const visibleTickets = [
      makeTicket("ticket_1", "col_todo", 1_000_000),
      makeTicket("ticket_3", "col_todo", 3_000_000),
    ];

    const nextVisibleTickets = moveTicket(columns, visibleTickets, "ticket_3", "ticket_1");

    expect(buildRepositionInput(columns, nextVisibleTickets, "ticket_3")).toEqual({
      columnId: "col_todo",
      prevVisibleTicketId: null,
      nextVisibleTicketId: "ticket_1",
    });
  });
});
