import type { Column, Ticket } from "@gtd/contracts";
import { describe, expect, it } from "vitest";

import {
  buildSwimlaneRepositionInput,
  buildSwimlanes,
  resolveTicketSwimlane,
  UNLABELED_SWIMLANE_KEY,
} from "./swimlanes";

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
    id: "col_done",
    boardId,
    statusKey: "done",
    statusName: "Done",
    statusCategory: "completed",
    name: "Done",
    position: 1,
  },
];

function makeTicket(
  id: string,
  statusKey: Ticket["statusKey"],
  labels: Ticket["labels"],
): Ticket {
  return {
    id,
    statusKey,
    title: `Ticket ${id}`,
    description: "",
    priority: "medium",
    uiOrder: 1_000_000,
    labels,
    completedAt: statusKey === "done" ? timestamp : null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("swimlane helpers", () => {
  it("uses the first non-implicit label as the swimlane key", () => {
    const ticket = makeTicket("ticket_1", "todo", [
      { id: "label_board", name: "frontend", normalizedName: "frontend" },
      { id: "label_api", name: "backend", normalizedName: "backend" },
    ]);

    expect(
      resolveTicketSwimlane(ticket, new Set(["frontend"])),
    ).toEqual({
      key: "backend",
      name: "backend",
    });
  });

  it("falls back to the unlabeled swimlane when only implicit labels exist", () => {
    const ticket = makeTicket("ticket_1", "todo", [
      { id: "label_board", name: "frontend", normalizedName: "frontend" },
    ]);

    expect(resolveTicketSwimlane(ticket, new Set(["frontend"])).key).toBe(
      UNLABELED_SWIMLANE_KEY,
    );
  });

  it("builds swimlanes in first-seen ticket order", () => {
    const tickets = [
      makeTicket("ticket_1", "todo", [
        { id: "label_backend", name: "backend", normalizedName: "backend" },
      ]),
      makeTicket("ticket_2", "todo", []),
      makeTicket("ticket_3", "done", [
        { id: "label_frontend", name: "frontend", normalizedName: "frontend" },
      ]),
    ];

    expect(buildSwimlanes(columns, tickets, new Set()).map((lane) => lane.name)).toEqual([
      "backend",
      "Unlabeled",
    ]);
  });

  it("hides swimlanes that only contain completed tickets", () => {
    const tickets = [
      makeTicket("ticket_1", "done", [
        { id: "label_frontend", name: "frontend", normalizedName: "frontend" },
      ]),
      makeTicket("ticket_2", "todo", [
        { id: "label_backend", name: "backend", normalizedName: "backend" },
      ]),
    ];

    expect(buildSwimlanes(columns, tickets, new Set()).map((lane) => lane.name)).toEqual([
      "backend",
    ]);
  });

  it("builds reposition input within the current swimlane only", () => {
    const tickets = [
      makeTicket("ticket_1", "todo", [
        { id: "label_backend", name: "backend", normalizedName: "backend" },
      ]),
      makeTicket("ticket_2", "todo", [
        { id: "label_frontend", name: "frontend", normalizedName: "frontend" },
      ]),
      makeTicket("ticket_3", "todo", [
        { id: "label_backend_2", name: "backend", normalizedName: "backend" },
      ]),
    ];

    expect(
      buildSwimlaneRepositionInput(columns, tickets, "ticket_3", new Set()),
    ).toEqual({
      statusKey: "todo",
      prevVisibleTicketId: "ticket_1",
      nextVisibleTicketId: null,
    });
  });
});
