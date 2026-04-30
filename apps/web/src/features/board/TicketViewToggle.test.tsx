import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TicketViewToggle } from "./TicketViewToggle";

describe("TicketViewToggle", () => {
  it("shows the current state and switches to compact mode when clicked", () => {
    const onChange = vi.fn();

    render(<TicketViewToggle value="full" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Full ticket view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Compact ticket view" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Compact ticket view" }));

    expect(onChange).toHaveBeenCalledWith("compact");
  });
});
