import { DndContext } from "@dnd-kit/core";
import type { Column, Ticket } from "@gtd/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BoardColumn } from "./BoardColumn";

const column: Column = {
  id: "column_todo",
  boardId: "board_default",
  name: "Todo",
  statusKey: "todo",
  statusName: "Todo",
  statusCategory: "active",
  position: 0,
};

const ticket: Ticket = {
  id: "ticket_1",
  statusKey: "todo",
  title: "Example task",
  description: "",
  priority: "medium",
  uiOrder: 1_000_000,
  labels: [],
  completedAt: null,
  archivedAt: null,
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

describe("BoardColumn", () => {
  it("opens the create flow when the tail area is double clicked", () => {
    const onCreateTicket = vi.fn();

    render(
      <DndContext>
        <BoardColumn
          column={column}
          expandedTicketIds={new Set()}
          tickets={[ticket]}
          onCreateTicket={onCreateTicket}
          onEditTicket={vi.fn()}
          onInlineTitleUpdate={vi.fn().mockResolvedValue(undefined)}
          onToggleTicketExpanded={vi.fn()}
          viewMode="compact"
        />
      </DndContext>,
    );

    fireEvent.doubleClick(screen.getByTestId("column-tail-todo"));

    expect(onCreateTicket).toHaveBeenCalledWith("todo");
  });

  it("toggles collapse from the column header", () => {
    const onToggleCollapsed = vi.fn();

    render(
      <DndContext>
        <BoardColumn
          column={column}
          expandedTicketIds={new Set()}
          tickets={[ticket]}
          onCreateTicket={vi.fn()}
          onEditTicket={vi.fn()}
          onInlineTitleUpdate={vi.fn().mockResolvedValue(undefined)}
          onToggleCollapsed={onToggleCollapsed}
          onToggleTicketExpanded={vi.fn()}
          viewMode="compact"
        />
      </DndContext>,
    );

    fireEvent.click(screen.getByTestId("column-collapse-todo"));

    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });
});
