import type { Column, Label, Ticket } from "@gtd/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TicketModal } from "./TicketModal";

const columns: Column[] = [
  {
    id: "col_todo",
    boardId: "board_default",
    key: "todo",
    name: "Todo",
    position: 0,
  },
  {
    id: "col_done",
    boardId: "board_default",
    key: "done",
    name: "Done",
    position: 1,
  },
];

const availableLabels: Label[] = [
  {
    id: "label_frontend",
    boardId: "board_default",
    name: "frontend",
    normalizedName: "frontend",
  },
  {
    id: "label_backend",
    boardId: "board_default",
    name: "backend",
    normalizedName: "backend",
  },
];

const existingTicket: Ticket = {
  id: "ticket_1",
  boardId: "board_default",
  columnId: "col_done",
  title: "Refine modal copy",
  description: "Update the edit flow wording.",
  priority: "high",
  uiOrder: 1_000_000,
  labels: availableLabels,
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

describe("TicketModal", () => {
  it("renders create defaults and submits trimmed, deduplicated labels", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <TicketModal
        mode="create"
        ticket={null}
        columns={columns}
        availableLabels={availableLabels}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Create Ticket" })).toBeInTheDocument();
    expect(screen.getByLabelText("Column")).toHaveValue("col_todo");
    expect(screen.getByLabelText("Priority")).toHaveValue("medium");
    expect(screen.getByText("Existing labels: frontend, backend")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "  Add tests for modal  " },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "  Cover create and edit paths.  " },
    });
    fireEvent.change(screen.getByPlaceholderText("frontend, backend, product"), {
      target: { value: "frontend, backend, frontend, qa " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Ticket" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        columnId: "col_todo",
        title: "Add tests for modal",
        description: "Cover create and edit paths.",
        priority: "medium",
        labels: ["frontend", "backend", "qa"],
      }),
    );
  });

  it("prefills edit mode fields and submits the updated values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <TicketModal
        mode="edit"
        ticket={existingTicket}
        columns={columns}
        availableLabels={availableLabels}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Edit Ticket" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Refine modal copy");
    expect(screen.getByLabelText("Description")).toHaveValue("Update the edit flow wording.");
    expect(screen.getByLabelText("Column")).toHaveValue("col_done");
    expect(screen.getByLabelText("Priority")).toHaveValue("high");
    expect(screen.getByPlaceholderText("frontend, backend, product")).toHaveValue("frontend, backend");

    fireEvent.change(screen.getByLabelText("Priority"), {
      target: { value: "low" },
    });
    fireEvent.change(screen.getByPlaceholderText("frontend, backend, product"), {
      target: { value: "backend, product" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        columnId: "col_done",
        title: "Refine modal copy",
        description: "Update the edit flow wording.",
        priority: "low",
        labels: ["backend", "product"],
      }),
    );
  });

  it("closes on backdrop and action button clicks", () => {
    const onClose = vi.fn();

    render(
      <TicketModal
        mode="create"
        ticket={null}
        columns={columns}
        availableLabels={availableLabels}
        onClose={onClose}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("presentation"));

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
