import type { Board } from "@gtd/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { router } from "../routes/router";

function board(overrides: Partial<Board>): Board {
  return {
    id: overrides.id ?? overrides.slug ?? "board",
    slug: overrides.slug ?? "board",
    name: overrides.name ?? "Board",
    description: overrides.description ?? "",
    isDefault: overrides.isDefault ?? false,
    isPinned: overrides.isPinned ?? false,
    showPriorityColors: overrides.showPriorityColors ?? false,
    collapseMenusByDefault: overrides.collapseMenusByDefault ?? false,
    swimlaneLayout: overrides.swimlaneLayout ?? "none",
    swimlaneLabelOrder: overrides.swimlaneLabelOrder ?? [],
    isSystem: overrides.isSystem ?? false,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function stubAppFetch(boards: Board[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/boards") {
        return Promise.resolve(jsonResponse(boards));
      }

      if (url === "/api/labels") {
        return Promise.resolve(jsonResponse({ labels: [] }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }),
  );
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await router.navigate("/");
});

describe("App board finder shortcut", () => {
  it("focuses the inline finder on Home when slash is pressed", async () => {
    stubAppFetch([board({ id: "work", name: "Work", slug: "work" })]);
    await router.navigate("/");

    render(<App />);

    const finder = await screen.findByRole("combobox", { name: "Find a board" });
    finder.blur();

    fireEvent.keyDown(document, { key: "/" });

    expect(finder).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "Board finder" })).not.toBeInTheDocument();
  });

  it("opens the finder overlay away from Home and closes it on Escape", async () => {
    stubAppFetch([board({ id: "work", name: "Work", slug: "work" })]);
    await router.navigate("/labels");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Labels" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "/" });

    expect(await screen.findByRole("dialog", { name: "Board finder" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Find a board" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Board finder" })).not.toBeInTheDocument();
    });
  });
});
