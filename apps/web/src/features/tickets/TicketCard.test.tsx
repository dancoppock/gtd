import type { Ticket } from "@gtd/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TicketCard } from "./TicketCard";

const ticket: Ticket = {
  id: "ticket_1",
  boardId: "board_default",
  columnId: "col_todo",
  title: "Refine compact ticket card",
  description: "Hide lower-priority metadata in compact mode.",
  priority: "medium",
  uiOrder: 1_000_000,
  labels: [
    {
      id: "label_frontend",
      boardId: "board_default",
      name: "frontend",
      normalizedName: "frontend",
    },
    {
      id: "label_ux",
      boardId: "board_default",
      name: "ux",
      normalizedName: "ux",
    },
  ],
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

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
    expect(
      screen.queryByText("Hide lower-priority metadata in compact mode."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("frontend")).not.toBeInTheDocument();
    expect(screen.queryByText("ux")).not.toBeInTheDocument();
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
