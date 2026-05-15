import type { Column, Ticket } from "@gtd/contracts";
import { describe, expect, it } from "vitest";

import {
  buildSwimlaneRepositionInput,
  buildSwimlanes,
  resolveTicketSwimlane,
  UNLABELED_SWIMLANE_KEY,
  updateTicketSwimlaneLabels,
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
  it("uses the first non-board-filter label as the swimlane key", () => {
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

  it("falls back to the first label when only board-filter labels exist", () => {
    const ticket = makeTicket("ticket_1", "todo", [
      { id: "label_board", name: "frontend", normalizedName: "frontend" },
    ]);

    expect(resolveTicketSwimlane(ticket, new Set(["frontend"]))).toEqual({
      key: "frontend",
      name: "frontend",
    });
  });

  it("falls back to the unlabeled swimlane when the ticket has no labels", () => {
    const ticket = makeTicket("ticket_1", "todo", []);

    expect(resolveTicketSwimlane(ticket, new Set(["frontend"])).key).toBe(UNLABELED_SWIMLANE_KEY);
  });

  it("builds swimlanes from board-filter labels when tickets have no extra labels", () => {
    const tickets = [
      makeTicket("ticket_1", "todo", [
        { id: "label_frontend", name: "frontend", normalizedName: "frontend" },
      ]),
      makeTicket("ticket_2", "todo", [
        { id: "label_backend", name: "backend", normalizedName: "backend" },
      ]),
    ];

    expect(
      buildSwimlanes(columns, tickets, new Set(["frontend", "backend"])).map((lane) => lane.name),
    ).toEqual(["backend", "frontend"]);
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

  it("orders swimlanes by label priority and keeps unlabeled last", () => {
    const tickets = [
      makeTicket("ticket_1", "todo", [
        { id: "label_frontend", name: "frontend", normalizedName: "frontend" },
      ]),
      makeTicket("ticket_2", "todo", []),
      makeTicket("ticket_3", "todo", [
        { id: "label_backend", name: "backend", normalizedName: "backend" },
      ]),
      makeTicket("ticket_4", "todo", [
        { id: "label_design", name: "design", normalizedName: "design" },
      ]),
    ];

    expect(
      buildSwimlanes(columns, tickets, new Set(), ["backend", "frontend"]).map((lane) => lane.name),
    ).toEqual(["backend", "frontend", "design", "Unlabeled"]);
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

  it("replaces the source swimlane label and preserves other labels", () => {
    const ticket = makeTicket("ticket_1", "todo", [
      { id: "label_team", name: "team", normalizedName: "team" },
      { id: "label_backend", name: "backend", normalizedName: "backend" },
      { id: "label_urgent", name: "urgent", normalizedName: "urgent" },
    ]);

    expect(
      updateTicketSwimlaneLabels(
        ticket,
        { key: "frontend", name: "frontend" },
        new Set(["team"]),
      ).map((label) => label.normalizedName),
    ).toEqual(["team", "urgent", "frontend"]);
  });

  it("adds the board default label when moving from a filter swimlane into a non-filter swimlane", () => {
    const ticket = makeTicket("ticket_1", "todo", [
      { id: "label_backend", name: "backend", normalizedName: "backend" },
    ]);

    expect(
      updateTicketSwimlaneLabels(
        ticket,
        { key: "blocked", name: "blocked" },
        new Set(["frontend", "backend"]),
        "frontend",
      ).map((label) => label.normalizedName),
    ).toEqual(["blocked", "frontend"]);
  });

  it("keeps the board default label when moving from the default swimlane into a non-filter swimlane", () => {
    const ticket = makeTicket("ticket_1", "todo", [
      { id: "label_frontend", name: "frontend", normalizedName: "frontend" },
      { id: "label_backend", name: "backend", normalizedName: "backend" },
    ]);

    expect(
      updateTicketSwimlaneLabels(
        ticket,
        { key: "blocked", name: "blocked" },
        new Set(["frontend", "backend"]),
        "frontend",
      ).map((label) => label.normalizedName),
    ).toEqual(["backend", "blocked", "frontend"]);
  });

  it("removes the board default source label when moving into another filter swimlane", () => {
    const ticket = makeTicket("ticket_1", "todo", [
      { id: "label_frontend", name: "frontend", normalizedName: "frontend" },
      { id: "label_support", name: "support", normalizedName: "support" },
    ]);

    expect(
      updateTicketSwimlaneLabels(
        ticket,
        { key: "backend", name: "backend" },
        new Set(["frontend", "backend", "support"]),
        "frontend",
      ).map((label) => label.normalizedName),
    ).toEqual(["support", "backend"]);
  });

  it("removes the board default label when moving from a non-filter swimlane into a filter swimlane", () => {
    const ticket = makeTicket("ticket_1", "todo", [
      { id: "label_blocked", name: "blocked", normalizedName: "blocked" },
      { id: "label_frontend", name: "frontend", normalizedName: "frontend" },
      { id: "label_urgent", name: "urgent", normalizedName: "urgent" },
    ]);

    expect(
      updateTicketSwimlaneLabels(
        ticket,
        { key: "backend", name: "backend" },
        new Set(["frontend", "backend"]),
        "frontend",
      ).map((label) => label.normalizedName),
    ).toEqual(["urgent", "backend"]);
  });

  it("removes the source swimlane label when moving to unlabeled", () => {
    const ticket = makeTicket("ticket_1", "todo", [
      { id: "label_backend", name: "backend", normalizedName: "backend" },
      { id: "label_urgent", name: "urgent", normalizedName: "urgent" },
    ]);

    expect(
      updateTicketSwimlaneLabels(
        ticket,
        { key: UNLABELED_SWIMLANE_KEY, name: "Unlabeled" },
        new Set(),
      ).map((label) => label.normalizedName),
    ).toEqual(["urgent"]);
  });
});
