import type { Ticket } from "@gtd/contracts";
import { render, screen } from "@testing-library/react";
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
});
