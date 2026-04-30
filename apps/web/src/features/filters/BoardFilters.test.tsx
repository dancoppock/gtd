import type { BoardFilters as BoardFiltersState, Label } from "@gtd/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BoardFilters } from "./BoardFilters";

const filters: BoardFiltersState = {
  priorities: ["medium"],
  labels: ["backend"],
  q: "modal",
};

const availableLabels: Label[] = [
  {
    id: "label_backend",
    boardId: "board_default",
    name: "backend",
    normalizedName: "backend",
  },
  {
    id: "label_frontend",
    boardId: "board_default",
    name: "frontend",
    normalizedName: "frontend",
  },
];

describe("BoardFilters", () => {
  function expandFilters() {
    fireEvent.click(screen.getByRole("button", { name: "Expand filters panel" }));
  }

  it("calls onChange with the updated search text", () => {
    const onChange = vi.fn();

    render(
      <BoardFilters
        filters={filters}
        availableLabels={availableLabels}
        onChange={onChange}
        onClear={vi.fn()}
      />,
    );

    expandFilters();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "drag" },
    });

    expect(onChange).toHaveBeenCalledWith({
      priorities: ["medium"],
      labels: ["backend"],
      q: "drag",
    });
  });

  it("toggles priority and label filters through checkbox interactions", () => {
    const onChange = vi.fn();

    render(
      <BoardFilters
        filters={filters}
        availableLabels={availableLabels}
        onChange={onChange}
        onClear={vi.fn()}
      />,
    );

    expandFilters();
    fireEvent.click(screen.getByLabelText(/^high$/));
    fireEvent.click(screen.getByLabelText(/^frontend$/));

    expect(onChange).toHaveBeenNthCalledWith(1, {
      priorities: ["medium", "high"],
      labels: ["backend"],
      q: "modal",
    });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      priorities: ["medium"],
      labels: ["backend", "frontend"],
      q: "modal",
    });
  });

  it("calls onClear and shows the empty-state hint when there are no labels", () => {
    const onClear = vi.fn();

    render(
      <BoardFilters
        filters={{ priorities: [], labels: [], q: "" }}
        availableLabels={[]}
        onChange={vi.fn()}
        onClear={onClear}
      />,
    );

    expandFilters();
    fireEvent.click(screen.getByRole("button", { name: "Clear Filters" }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Labels appear here as they are created.")).toBeInTheDocument();
  });

  it("collapses and expands the filter controls", () => {
    render(
      <BoardFilters
        filters={filters}
        availableLabels={availableLabels}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.queryByRole("searchbox", { name: "Search" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand filters panel" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand filters panel" }));

    expect(screen.getByRole("searchbox", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse filters panel" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
