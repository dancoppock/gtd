import type { Column, Ticket } from "@gtd/contracts";
import { describe, expect, it } from "vitest";

import { getNextTicketId, getTicketMoveTarget, type BoardTicketLane } from "./keyboard";

const columns: Column[] = [
  {
    id: "column_todo",
    boardId: "board_default",
    name: "Todo",
    statusKey: "todo",
    statusName: "Todo",
    statusCategory: "active",
    position: 0,
  },
  {
    id: "column_doing",
    boardId: "board_default",
    name: "Doing",
    statusKey: "doing",
    statusName: "Doing",
    statusCategory: "active",
    position: 1,
  },
  {
    id: "column_done",
    boardId: "board_default",
    name: "Done",
    statusKey: "done",
    statusName: "Done",
    statusCategory: "completed",
    position: 2,
  },
];

function ticket(id: string, statusKey: string): Ticket {
  return {
    id,
    statusKey,
    title: id,
    description: "",
    priority: "medium",
    uiOrder: 1_000_000,
    labels: [],
    completedAt: null,
    archivedAt: null,
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
  };
}

const lanes: BoardTicketLane[] = [
  {
    key: "main",
    tickets: [
      ticket("todo_1", "todo"),
      ticket("todo_2", "todo"),
      ticket("doing_1", "doing"),
      ticket("done_1", "done"),
    ],
  },
];

describe("keyboard ticket navigation", () => {
  it("enters the leftmost column from the top or bottom when no ticket is selected", () => {
    expect(getNextTicketId(columns, lanes, null, "down")).toBe("todo_1");
    expect(getNextTicketId(columns, lanes, null, "up")).toBe("todo_2");
  });

  it("enters edge columns with horizontal arrows when no ticket is selected", () => {
    expect(getNextTicketId(columns, lanes, null, "right")).toBe("todo_1");
    expect(getNextTicketId(columns, lanes, null, "left")).toBe("done_1");
  });

  it("moves horizontally to the nearest available ticket in the next column", () => {
    expect(getNextTicketId(columns, lanes, "todo_2", "right")).toBe("doing_1");
    expect(getNextTicketId(columns, lanes, "doing_1", "left")).toBe("todo_1");
  });

  it("wraps vertical navigation within the rendered column", () => {
    expect(getNextTicketId(columns, lanes, "todo_2", "down")).toBe("todo_1");
    expect(getNextTicketId(columns, lanes, "todo_1", "up")).toBe("todo_2");
  });

  it("wraps horizontal navigation across edge columns", () => {
    expect(getNextTicketId(columns, lanes, "done_1", "right")).toBe("todo_1");
    expect(getNextTicketId(columns, lanes, "todo_1", "left")).toBe("done_1");
  });

  it("keeps swimlane horizontal navigation within the same lane when possible", () => {
    const swimlaneLanes: BoardTicketLane[] = [
      {
        key: "frontend",
        tickets: [ticket("frontend_todo", "todo"), ticket("frontend_doing", "doing")],
      },
      {
        key: "backend",
        tickets: [ticket("backend_todo", "todo"), ticket("backend_done", "done")],
      },
    ];

    expect(getNextTicketId(columns, swimlaneLanes, "backend_todo", "right")).toBe("backend_done");
  });

  it("wraps swimlane vertical navigation through the visible column stack", () => {
    const swimlaneLanes: BoardTicketLane[] = [
      {
        key: "frontend",
        tickets: [ticket("frontend_todo", "todo")],
      },
      {
        key: "backend",
        tickets: [ticket("backend_todo", "todo")],
      },
    ];

    expect(getNextTicketId(columns, swimlaneLanes, "backend_todo", "down")).toBe("frontend_todo");
    expect(getNextTicketId(columns, swimlaneLanes, "frontend_todo", "up")).toBe("backend_todo");
  });

  it("returns one-step drag-equivalent targets for quick moves", () => {
    expect(getTicketMoveTarget(columns, lanes, "todo_1", "down")).toBe("todo_2");
    expect(getTicketMoveTarget(columns, lanes, "todo_2", "down")).toBe("column_todo");
    expect(getTicketMoveTarget(columns, lanes, "todo_2", "right")).toBe("doing_1");
  });

  it("prefers same-swimlane vertical move targets before column-edge targets", () => {
    const swimlaneLanes: BoardTicketLane[] = [
      {
        key: "frontend",
        tickets: [
          ticket("frontend_todo_1", "todo"),
          ticket("frontend_todo_2", "todo"),
        ],
      },
      {
        key: "backend",
        tickets: [
          ticket("backend_todo_1", "todo"),
          ticket("backend_todo_2", "todo"),
        ],
      },
    ];

    expect(getTicketMoveTarget(columns, swimlaneLanes, "frontend_todo_1", "down")).toBe("frontend_todo_2");
    expect(getTicketMoveTarget(columns, swimlaneLanes, "frontend_todo_2", "down")).toBe("column_todo");
    expect(getTicketMoveTarget(columns, swimlaneLanes, "backend_todo_2", "up")).toBe("backend_todo_1");
    expect(getTicketMoveTarget(columns, swimlaneLanes, "backend_todo_1", "up")).toBeNull();
  });
});
