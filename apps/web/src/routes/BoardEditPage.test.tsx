import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardEditPage } from "./BoardEditPage";

function renderBoardEditPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/boards/new"]}>
        <BoardEditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BoardEditPage", () => {
  it("clears the default new column name when the title input receives focus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();

        if (url === "/api/labels") {
          return Promise.resolve(jsonResponse({ labels: [] }));
        }

        if (url === "/api/statuses") {
          return Promise.resolve(
            jsonResponse({
              statuses: [
                { key: "todo", name: "Todo", category: "active", isSystem: false },
                { key: "in_progress", name: "In Progress", category: "active", isSystem: false },
                { key: "done", name: "Done", category: "completed", isSystem: false },
              ],
            }),
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    renderBoardEditPage();

    fireEvent.click(screen.getByRole("button", { name: "Add Column" }));

    const columnNameInputs = await screen.findAllByLabelText("Column Name");
    const newColumnNameInput = columnNameInputs.at(-1);

    expect(newColumnNameInput).toHaveValue("New Column");

    fireEvent.focus(newColumnNameInput as HTMLElement);

    expect(newColumnNameInput).toHaveValue("");
  });
});
