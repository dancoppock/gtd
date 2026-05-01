import type { Column, Label, Ticket } from "@gtd/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TicketModal } from "./TicketModal";

const columns: Column[] = [
  {
    id: "col_todo",
    boardId: "board_default",
    statusKey: "todo",
    statusName: "Todo",
    statusCategory: "active",
    name: "Todo",
    position: 0,
  },
  {
    id: "col_done",
    boardId: "board_default",
    statusKey: "done",
    statusName: "Done",
    statusCategory: "completed",
    name: "Done",
    position: 1,
  },
];

const availableLabels: Label[] = [
  {
    id: "label_frontend",
    name: "frontend",
    normalizedName: "frontend",
  },
  {
    id: "label_backend",
    name: "backend",
    normalizedName: "backend",
  },
];

const implicitLabels: Label[] = [
  {
    id: "label_qa",
    name: "qa",
    normalizedName: "qa",
  },
];

const existingTicket: Ticket = {
  id: "ticket_1",
  statusKey: "done",
  title: "Refine modal copy",
  description: "Update the edit flow wording.",
  priority: "high",
  uiOrder: 1_000_000,
  labels: availableLabels,
  archivedAt: null,
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
    expect(screen.getByLabelText("Title")).toHaveFocus();
    expect(screen.getByLabelText("Column")).toHaveValue("todo");
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
        statusKey: "todo",
        title: "Add tests for modal",
        description: "Cover create and edit paths.",
        priority: "medium",
        labels: ["frontend", "backend", "qa"],
      }),
    );
  });

  it("adds labels from title hashtags and strips them from the saved title", async () => {
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

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Test task #backend #qa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Ticket" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        statusKey: "todo",
        title: "Test task",
        description: "",
        priority: "medium",
        labels: ["backend", "qa"],
      }),
    );
  });

  it("shows implicit board labels in create mode and includes them on submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <TicketModal
        mode="create"
        ticket={null}
        columns={columns}
        availableLabels={availableLabels}
        implicitLabels={implicitLabels}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId("ticket-modal-implicit-labels")).toHaveTextContent(
      "Board labels added automatically: qa",
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Create filtered ticket" },
    });
    fireEvent.change(screen.getByPlaceholderText("frontend, backend, product"), {
      target: { value: "backend, qa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Ticket" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        statusKey: "todo",
        title: "Create filtered ticket",
        description: "",
        priority: "medium",
        labels: ["backend", "qa"],
      }),
    );
  });

  it("uses the provided default status in create mode", () => {
    render(
      <TicketModal
        mode="create"
        ticket={null}
        columns={columns}
        availableLabels={availableLabels}
        defaultStatusKey="done"
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText("Column")).toHaveValue("done");
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
    expect(screen.getByLabelText("Column")).toHaveValue("done");
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
        statusKey: "done",
        title: "Refine modal copy",
        description: "Update the edit flow wording.",
        priority: "low",
        labels: ["backend", "product"],
      }),
    );
  });

  it("preserves existing labels when editing and adds any new title hashtags", async () => {
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

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Refine modal copy #qa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        statusKey: "done",
        title: "Refine modal copy",
        description: "Update the edit flow wording.",
        priority: "high",
        labels: ["frontend", "backend", "qa"],
      }),
    );
  });

  it("shows a delete button in edit mode and calls onDelete when clicked", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <TicketModal
        mode="edit"
        ticket={existingTicket}
        columns={columns}
        availableLabels={availableLabels}
        onClose={vi.fn()}
        onDelete={onDelete}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete ticket" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it("does not show a delete button in create mode", () => {
    render(
      <TicketModal
        mode="create"
        ticket={null}
        columns={columns}
        availableLabels={availableLabels}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByRole("button", { name: "Delete ticket" })).not.toBeInTheDocument();
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

  it("closes when Escape is pressed", () => {
    const onClose = vi.fn();

    render(
      <TicketModal
        mode="edit"
        ticket={existingTicket}
        columns={columns}
        availableLabels={availableLabels}
        onClose={onClose}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
