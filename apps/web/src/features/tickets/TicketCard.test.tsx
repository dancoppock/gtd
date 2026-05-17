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
  Reflect.deleteProperty(HTMLParagraphElement.prototype, "clientHeight");
  Reflect.deleteProperty(HTMLParagraphElement.prototype, "scrollHeight");
});

describe("TicketCard", () => {
  it("renders description and labels in full mode", () => {
    render(<TicketCard ticket={ticket} onEdit={vi.fn()} viewMode="full" />);

    expect(screen.getByText("Refine compact ticket card")).toBeInTheDocument();
    expect(screen.getByText("Hide lower-priority metadata in compact mode.")).toBeInTheDocument();
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("ux")).toBeInTheDocument();
  });

  it("preserves paragraph breaks in rendered descriptions", () => {
    render(
      <TicketCard
        ticket={{
          ...ticket,
          description: "First paragraph\n\nSecond paragraph",
        }}
        onEdit={vi.fn()}
        viewMode="full"
      />,
    );

    expect(screen.getByTestId("ticket-description-ticket_1").textContent).toBe(
      "First paragraph\n\nSecond paragraph",
    );
    expect(screen.getByTestId("ticket-description-ticket_1")).toHaveClass("ticket-card__description");
  });

  it("shows the priority color stripe when enabled", () => {
    render(<TicketCard ticket={ticket} showPriorityColor onEdit={vi.fn()} viewMode="full" />);

    expect(screen.getByTestId("ticket-content-ticket_1")).toHaveClass(
      "ticket-card__content--priority-color",
      "ticket-card__content--priority-medium",
    );
  });

  it("does not expand a long full-mode description when the card is unselected", () => {
    Object.defineProperty(HTMLParagraphElement.prototype, "clientHeight", {
      configurable: true,
      value: 150,
    });
    Object.defineProperty(HTMLParagraphElement.prototype, "scrollHeight", {
      configurable: true,
      value: 320,
    });

    render(<TicketCard ticket={ticket} onEdit={vi.fn()} viewMode="full" />);

    fireEvent.click(screen.getByTestId("ticket-content-ticket_1"));

    expect(screen.getByText("[...]")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-description-ticket_1")).not.toHaveClass(
      "ticket-card__description--full",
    );
  });

  it("toggles a long selected full-mode description between clamped and full text", () => {
    Object.defineProperty(HTMLParagraphElement.prototype, "clientHeight", {
      configurable: true,
      value: 150,
    });
    Object.defineProperty(HTMLParagraphElement.prototype, "scrollHeight", {
      configurable: true,
      value: 320,
    });

    render(<TicketCard ticket={ticket} isSelected onEdit={vi.fn()} viewMode="full" />);

    expect(screen.getByText("[...]")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-description-ticket_1")).not.toHaveClass(
      "ticket-card__description--full",
    );

    fireEvent.click(screen.getByTestId("ticket-content-ticket_1"));

    expect(screen.queryByText("[...]")).not.toBeInTheDocument();
    expect(screen.getByTestId("ticket-description-ticket_1")).toHaveClass(
      "ticket-card__description--full",
    );

    fireEvent.click(screen.getByTestId("ticket-content-ticket_1"));

    expect(screen.getByText("[...]")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-description-ticket_1")).not.toHaveClass(
      "ticket-card__description--full",
    );
  });

  it("hides the priority color stripe when disabled", () => {
    render(<TicketCard ticket={ticket} onEdit={vi.fn()} viewMode="full" />);

    expect(screen.getByTestId("ticket-content-ticket_1")).not.toHaveClass(
      "ticket-card__content--priority-color",
    );
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

  it("does not clamp or add a description ellipsis when a compact card is expanded", () => {
    Object.defineProperty(HTMLParagraphElement.prototype, "clientHeight", {
      configurable: true,
      value: 150,
    });
    Object.defineProperty(HTMLParagraphElement.prototype, "scrollHeight", {
      configurable: true,
      value: 320,
    });

    render(<TicketCard ticket={ticket} isExpanded onEdit={vi.fn()} viewMode="compact" />);

    expect(screen.queryByText("[...]")).not.toBeInTheDocument();
    expect(screen.getByTestId("ticket-description-ticket_1")).toHaveClass(
      "ticket-card__description--full",
    );
  });

  it("does not toggle expanded state when unselected compact card content is clicked", () => {
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

    expect(onToggleExpanded).not.toHaveBeenCalled();
  });

  it("toggles expanded state when selected compact card content is clicked", () => {
    const onToggleExpanded = vi.fn();

    render(
      <TicketCard
        dragHandleProps={{
          attributes: dragHandleAttributes,
          listeners: undefined,
        }}
        ticket={ticket}
        isSelected
        onEdit={vi.fn()}
        onToggleExpanded={onToggleExpanded}
        viewMode="compact"
      />,
    );

    fireEvent.click(screen.getByTestId("ticket-content-ticket_1"));

    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it("does not toggle expanded state when an unselected compact card title is single clicked", () => {
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

    expect(onToggleExpanded).not.toHaveBeenCalled();
  });

  it("toggles expanded state when the selected compact card title is single clicked", () => {
    vi.useFakeTimers();
    const onToggleExpanded = vi.fn();

    render(
      <TicketCard
        ticket={ticket}
        isSelected
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

  it("shows a block cursor on the selected title character", () => {
    const { container } = render(
      <TicketCard
        ticket={ticket}
        isSelected
        titleCursorIndex={2}
        onEdit={vi.fn()}
        viewMode="full"
      />,
    );

    expect(screen.getByTestId("ticket-title-ticket_1")).toHaveTextContent(ticket.title);
    expect(container.querySelector(".ticket-card__title-cursor")).toHaveTextContent("f");
  });

  it("starts inline title editing at the requested cursor position", async () => {
    render(
      <TicketCard
        ticket={ticket}
        beginEditingKey={1}
        beginEditingCursorIndex={3}
        onEdit={vi.fn()}
        viewMode="full"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId<HTMLInputElement>("ticket-title-input-ticket_1").selectionStart).toBe(3);
    });
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
