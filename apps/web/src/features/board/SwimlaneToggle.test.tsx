import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SwimlaneToggle } from "./SwimlaneToggle";

describe("SwimlaneToggle", () => {
  it("shows the current state and toggles on when clicked", () => {
    const onChange = vi.fn();

    render(<SwimlaneToggle value={false} onChange={onChange} />);

    expect(screen.getByTestId("swimlane-toggle")).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByTestId("swimlane-toggle"));

    expect(onChange).toHaveBeenCalledWith(true);
  });
});
