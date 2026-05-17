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

const doneColumn: Column = {
  ...column,
  id: "column_done",
  name: "Done",
  statusKey: "done",
  statusName: "Done",
  statusCategory: "completed",
  position: 1,
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

const doneTicket: Ticket = {
  ...ticket,
  statusKey: "done",
  priority: "high",
  completedAt: "2026-04-30T12:00:00.000Z",
};

describe("BoardColumn", () => {
  it("opens the create flow when the tail area is clicked", () => {
    const onCreateTicket = vi.fn();

    render(
      <DndContext>
        <BoardColumn
          column={column}
          expandedTicketIds={new Set()}
          showPriorityColors
          tickets={[ticket]}
          onCreateTicket={onCreateTicket}
          onEditTicket={vi.fn()}
          onInlineTitleUpdate={vi.fn().mockResolvedValue(undefined)}
          onToggleTicketExpanded={vi.fn()}
          viewMode="compact"
        />
      </DndContext>,
    );

    fireEvent.click(screen.getByTestId("column-tail-todo"));

    expect(onCreateTicket).toHaveBeenCalledWith("todo", "bottom");
  });

  it("opens the create flow at the top when the header add button is clicked", () => {
    const onCreateTicket = vi.fn();

    render(
      <DndContext>
        <BoardColumn
          column={column}
          expandedTicketIds={new Set()}
          showPriorityColors
          tickets={[ticket]}
          onCreateTicket={onCreateTicket}
          onEditTicket={vi.fn()}
          onInlineTitleUpdate={vi.fn().mockResolvedValue(undefined)}
          onToggleTicketExpanded={vi.fn()}
          viewMode="compact"
        />
      </DndContext>,
    );

    fireEvent.click(screen.getByTestId("column-add-todo"));

    expect(onCreateTicket).toHaveBeenCalledWith("todo", "top");
  });

  it("toggles collapse from the column header", () => {
    const onToggleCollapsed = vi.fn();

    render(
      <DndContext>
        <BoardColumn
          column={column}
          expandedTicketIds={new Set()}
          showPriorityColors
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

  it("hides priority color styling for tickets in completed columns", () => {
    render(
      <DndContext>
        <BoardColumn
          column={doneColumn}
          expandedTicketIds={new Set()}
          showPriorityColors
          tickets={[doneTicket]}
          onCreateTicket={vi.fn()}
          onEditTicket={vi.fn()}
          onInlineTitleUpdate={vi.fn().mockResolvedValue(undefined)}
          onToggleTicketExpanded={vi.fn()}
          viewMode="compact"
        />
      </DndContext>,
    );

    expect(screen.getByTestId("ticket-content-ticket_1")).not.toHaveClass(
      "ticket-card__content--priority-color",
      "ticket-card__content--priority-high",
    );
  });

  it("selects an unselected ticket without toggling compact expansion", () => {
    const onTicketClick = vi.fn();
    const onToggleTicketExpanded = vi.fn();

    render(
      <DndContext>
        <BoardColumn
          column={column}
          expandedTicketIds={new Set()}
          showPriorityColors
          tickets={[ticket]}
          onCreateTicket={vi.fn()}
          onEditTicket={vi.fn()}
          onInlineTitleUpdate={vi.fn().mockResolvedValue(undefined)}
          onTicketClick={onTicketClick}
          onToggleTicketExpanded={onToggleTicketExpanded}
          viewMode="compact"
        />
      </DndContext>,
    );

    fireEvent.click(screen.getByTestId("ticket-content-ticket_1"));

    expect(onTicketClick).toHaveBeenCalledTimes(1);
    expect(onTicketClick.mock.calls[0]?.[0]).toMatchObject({ id: "ticket_1" });
    expect(onToggleTicketExpanded).not.toHaveBeenCalled();
  });

  it("toggles compact expansion when an already selected ticket is clicked", () => {
    const onTicketClick = vi.fn();
    const onToggleTicketExpanded = vi.fn();

    render(
      <DndContext>
        <BoardColumn
          column={column}
          expandedTicketIds={new Set()}
          selectedTicketId="ticket_1"
          showPriorityColors
          tickets={[ticket]}
          onCreateTicket={vi.fn()}
          onEditTicket={vi.fn()}
          onInlineTitleUpdate={vi.fn().mockResolvedValue(undefined)}
          onTicketClick={onTicketClick}
          onToggleTicketExpanded={onToggleTicketExpanded}
          viewMode="compact"
        />
      </DndContext>,
    );

    fireEvent.click(screen.getByTestId("ticket-content-ticket_1"));

    expect(onToggleTicketExpanded).toHaveBeenCalledWith("ticket_1", { selectTicket: true });
    expect(onTicketClick).toHaveBeenCalledTimes(1);
  });

  it("selects an unselected ticket when the compact title is clicked", () => {
    const onTicketClick = vi.fn();
    const onToggleTicketExpanded = vi.fn();

    render(
      <DndContext>
        <BoardColumn
          column={column}
          expandedTicketIds={new Set()}
          showPriorityColors
          tickets={[ticket]}
          onCreateTicket={vi.fn()}
          onEditTicket={vi.fn()}
          onInlineTitleUpdate={vi.fn().mockResolvedValue(undefined)}
          onTicketClick={onTicketClick}
          onToggleTicketExpanded={onToggleTicketExpanded}
          viewMode="compact"
        />
      </DndContext>,
    );

    fireEvent.click(screen.getByTestId("ticket-title-ticket_1"));

    expect(onTicketClick).toHaveBeenCalledTimes(1);
    expect(onToggleTicketExpanded).not.toHaveBeenCalled();
  });
});
