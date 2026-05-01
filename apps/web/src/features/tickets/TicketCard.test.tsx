import type { Ticket } from "@gtd/contracts";
import type { DraggableAttributes } from "@dnd-kit/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TicketCard } from "./TicketCard";

const ticket: Ticket = {
  id: "ticket_1",
  statusKey: "todo",
  title: "Refine compact ticket card",
  description: "Hide lower-priority metadata in compact mode.",
  priority: "medium",
  uiOrder: 1_000_000,
  labels: [
    {
      id: "label_frontend",
      name: "frontend",
      normalizedName: "frontend",
    },
    {
      id: "label_ux",
      name: "ux",
      normalizedName: "ux",
    },
  ],
  completedAt: null,
  archivedAt: null,
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

const dragHandleAttributes: DraggableAttributes = {
  role: "button",
  tabIndex: 0,
  "aria-disabled": false,
  "aria-pressed": false,
  "aria-roledescription": "sortable",
  "aria-describedby": "ticket-drag-description",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("TicketCard", () => {
  it("renders description and labels in full mode", () => {
    render(<TicketCard ticket={ticket} onEdit={vi.fn()} viewMode="full" />);

    expect(screen.getByText("Refine compact ticket card")).toBeInTheDocument();
    expect(screen.getByText("Hide lower-priority metadata in compact mode.")).toBeInTheDocument();
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("ux")).toBeInTheDocument();
  });

  it("hides description and labels in compact mode", () => {
    render(<TicketCard ticket={ticket} onEdit={vi.fn()} viewMode="compact" />);

    expect(screen.getByText("Refine compact ticket card")).toBeInTheDocument();
    expect(screen.getByText("[...]")).toBeInTheDocument();
    expect(
      screen.queryByText("Hide lower-priority metadata in compact mode."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("frontend")).not.toBeInTheDocument();
    expect(screen.queryByText("ux")).not.toBeInTheDocument();
  });

  it("shows description and labels when a compact card is expanded", () => {
    render(<TicketCard ticket={ticket} isExpanded onEdit={vi.fn()} viewMode="compact" />);

    expect(screen.getByText("Hide lower-priority metadata in compact mode.")).toBeInTheDocument();
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("ux")).toBeInTheDocument();
    expect(screen.queryByText("[...]")).not.toBeInTheDocument();
  });

  it("toggles expanded state when compact card content is clicked", () => {
    const onToggleExpanded = vi.fn();

    render(
      <TicketCard
        dragHandleProps={{
          attributes: dragHandleAttributes,
          listeners: undefined,
        }}
        ticket={ticket}
        onEdit={vi.fn()}
        onToggleExpanded={onToggleExpanded}
        viewMode="compact"
      />,
    );

    fireEvent.click(screen.getByTestId("ticket-content-ticket_1"));

    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it("toggles expanded state when the compact card title is single clicked", () => {
    vi.useFakeTimers();
    const onToggleExpanded = vi.fn();

    render(
      <TicketCard
        ticket={ticket}
        onEdit={vi.fn()}
        onToggleExpanded={onToggleExpanded}
        viewMode="compact"
      />,
    );

    fireEvent.click(screen.getByTestId("ticket-title-ticket_1"));
    vi.advanceTimersByTime(250);

    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it("does not toggle expanded state when edit is clicked", () => {
    const onToggleExpanded = vi.fn();

    render(
      <TicketCard
        dragHandleProps={{
          attributes: dragHandleAttributes,
          listeners: undefined,
        }}
        ticket={ticket}
        onEdit={vi.fn()}
        onToggleExpanded={onToggleExpanded}
        viewMode="compact"
      />,
    );

    fireEvent.click(screen.getByTestId("ticket-edit-ticket_1"));

    expect(onToggleExpanded).not.toHaveBeenCalled();
  });

  it("applies the done tone styling class when rendered in the done column", () => {
    render(<TicketCard ticket={ticket} tone="done" onEdit={vi.fn()} viewMode="full" />);

    expect(screen.getByTestId("ticket-ticket_1")).toHaveClass("ticket-card--done");
  });

  it("starts inline title editing on double click and saves on Enter", async () => {
    const onTitleUpdate = vi.fn().mockResolvedValue(undefined);

    render(
      <TicketCard
        ticket={ticket}
        onEdit={vi.fn()}
        onTitleUpdate={onTitleUpdate}
        viewMode="full"
      />,
    );

    fireEvent.doubleClick(screen.getByTestId("ticket-title-ticket_1"));
    fireEvent.change(screen.getByTestId("ticket-title-input-ticket_1"), {
      target: { value: "Rename ticket inline" },
    });
    fireEvent.keyDown(screen.getByTestId("ticket-title-input-ticket_1"), {
      key: "Enter",
    });

    await waitFor(() => {
      expect(onTitleUpdate).toHaveBeenCalledWith("Rename ticket inline");
    });
  });

  it("cancels inline title editing on Escape", () => {
    const onTitleUpdate = vi.fn().mockResolvedValue(undefined);

    render(
      <TicketCard
        ticket={ticket}
        onEdit={vi.fn()}
        onTitleUpdate={onTitleUpdate}
        viewMode="full"
      />,
    );

    fireEvent.doubleClick(screen.getByTestId("ticket-title-ticket_1"));
    fireEvent.change(screen.getByTestId("ticket-title-input-ticket_1"), {
      target: { value: "Do not save this" },
    });
    fireEvent.keyDown(screen.getByTestId("ticket-title-input-ticket_1"), {
      key: "Escape",
    });

    expect(onTitleUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("Refine compact ticket card")).toBeInTheDocument();
  });
});
