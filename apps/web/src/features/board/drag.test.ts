import type { Column, Ticket } from "@gtd/contracts";
import { describe, expect, it } from "vitest";

import {
  buildRepositionInput,
  findStatusKey,
  haveSameTicketLayout,
  moveTicket,
} from "./drag";

const boardId = "board_test";
const timestamp = "2026-04-30T00:00:00.000Z";

const columns: Column[] = [
  {
    id: "col_todo",
    boardId,
    statusKey: "todo",
    statusName: "Todo",
    statusCategory: "active",
    name: "Todo",
    position: 0,
  },
  {
    id: "col_in_progress",
    boardId,
    statusKey: "in_progress",
    statusName: "In Progress",
    statusCategory: "active",
    name: "In Progress",
    position: 1,
  },
  {
    id: "col_done",
    boardId,
    statusKey: "done",
    statusName: "Done",
    statusCategory: "completed",
    name: "Done",
    position: 2,
  },
];

function makeTicket(id: string, statusKey: Ticket["statusKey"], uiOrder: number): Ticket {
  return {
    id,
    statusKey,
    title: `Ticket ${id}`,
    description: "",
    priority: "medium",
    uiOrder,
    labels: [],
    completedAt: null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("board drag helpers", () => {
  it("resolves a status key for both column and ticket drag targets", () => {
    const tickets = [
      makeTicket("ticket_1", "todo", 1_000_000),
      makeTicket("ticket_2", "done", 2_000_000),
    ];

    expect(findStatusKey(columns, tickets, "col_done")).toBe("done");
    expect(findStatusKey(columns, tickets, "ticket_1")).toBe("todo");
    expect(findStatusKey(columns, tickets, "missing")).toBeNull();
  });

  it("reorders tickets within the same visible column", () => {
    const tickets = [
      makeTicket("ticket_1", "todo", 1_000_000),
      makeTicket("ticket_2", "todo", 2_000_000),
      makeTicket("ticket_3", "done", 3_000_000),
    ];

    const nextTickets = moveTicket(columns, tickets, "ticket_2", "ticket_1");

    expect(nextTickets.map((ticket) => ticket.id)).toEqual(["ticket_2", "ticket_1", "ticket_3"]);
    expect(haveSameTicketLayout(tickets, nextTickets)).toBe(false);
  });

  it("moves a ticket into another visible status and appends when dropped on the column body", () => {
    const tickets = [
      makeTicket("ticket_1", "todo", 1_000_000),
      makeTicket("ticket_2", "todo", 2_000_000),
      makeTicket("ticket_3", "done", 3_000_000),
    ];

    const nextTickets = moveTicket(columns, tickets, "ticket_1", "col_done");

    expect(nextTickets.map((ticket) => `${ticket.id}:${ticket.statusKey}`)).toEqual([
      "ticket_2:todo",
      "ticket_3:done",
      "ticket_1:done",
    ]);
  });

  it("builds a reposition payload from the current visible order inside a status column", () => {
    const tickets = [
      makeTicket("ticket_1", "todo", 1_000_000),
      makeTicket("ticket_2", "todo", 2_000_000),
      makeTicket("ticket_3", "todo", 3_000_000),
    ];

    expect(buildRepositionInput(columns, tickets, "ticket_2")).toEqual({
      statusKey: "todo",
      prevVisibleTicketId: "ticket_1",
      nextVisibleTicketId: "ticket_3",
    });
  });

  it("uses only the visible subset when building reposition input for filtered boards", () => {
    const visibleTickets = [
      makeTicket("ticket_1", "todo", 1_000_000),
      makeTicket("ticket_3", "todo", 3_000_000),
    ];

    const nextVisibleTickets = moveTicket(columns, visibleTickets, "ticket_3", "ticket_1");

    expect(buildRepositionInput(columns, nextVisibleTickets, "ticket_3")).toEqual({
      statusKey: "todo",
      prevVisibleTicketId: null,
      nextVisibleTicketId: "ticket_1",
    });
  });
});
