import type { Board } from "@gtd/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomePage } from "./HomePage";

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

function LocationDisplay() {
  const location = useLocation();

  return <div data-testid="location">{location.pathname}</div>;
}

function renderHomePage(boards: Board[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/boards") {
        return Promise.resolve(jsonResponse(boards));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }),
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<HomePage />} path="/" />
          <Route element={<LocationDisplay />} path="/boards/:boardSlug" />
          <Route element={<LocationDisplay />} path="/boards" />
          <Route element={<LocationDisplay />} path="/labels" />
          <Route element={<LocationDisplay />} path="/insights" />
          <Route element={<LocationDisplay />} path="/help" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomePage", () => {
  it("focuses the board finder when home loads", async () => {
    renderHomePage([board({ id: "work", name: "Work", slug: "work" })]);

    const finder = await screen.findByRole("combobox", { name: "Find a board" });

    expect(finder).toHaveFocus();
  });

  it("filters boards as you type and opens the top match on Enter", async () => {
    renderHomePage([
      board({ id: "personal", name: "Personal", slug: "personal" }),
      board({ id: "work", name: "Work", slug: "work" }),
    ]);

    const finder = await screen.findByRole("combobox", { name: "Find a board" });

    fireEvent.change(finder, { target: { value: "wo" } });

    expect(await screen.findByRole("option", { name: "BOARD Work /work" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "BOARD Personal /personal" })).not.toBeInTheDocument();

    fireEvent.keyDown(finder, { key: "Enter" });

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/boards/work"));
  });

  it("includes page shortcuts in finder results", async () => {
    renderHomePage([board({ id: "work", name: "Work", slug: "work" })]);

    const finder = await screen.findByRole("combobox", { name: "Find a board" });

    fireEvent.change(finder, { target: { value: "lab" } });

    expect(await screen.findByRole("option", { name: "PAGE Labels /labels" })).toBeInTheDocument();

    fireEvent.keyDown(finder, { key: "Enter" });

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/labels"));
  });

  it("uses arrow keys to select a matching board before Enter", async () => {
    renderHomePage([
      board({ id: "admin", name: "Admin", slug: "admin" }),
      board({ id: "archive", name: "Archive", slug: "archive" }),
    ]);

    const finder = await screen.findByRole("combobox", { name: "Find a board" });

    fireEvent.change(finder, { target: { value: "a" } });
    expect(await screen.findByRole("option", { name: "BOARD Admin /admin" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(finder, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "BOARD Archive /archive" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(finder, { key: "Enter" });

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/boards/archive"));
  });

  it("focuses the finder when the global finder focus event fires", async () => {
    renderHomePage([board({ id: "work", name: "Work", slug: "work" })]);

    const finder = await screen.findByRole("combobox", { name: "Find a board" });
    finder.blur();

    expect(finder).not.toHaveFocus();

    document.dispatchEvent(new Event("board-finder:focus"));

    expect(finder).toHaveFocus();
  });

  it("keeps the app header on the home page", async () => {
    renderHomePage([board({ id: "work", name: "Work", slug: "work" })]);

    expect(await screen.findByRole("heading", { name: "GTD" })).toBeInTheDocument();
    expect(screen.getByText("Organize your tasks, notes and thoughts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Boards" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Find a board" })).toBeInTheDocument();
  });
});
