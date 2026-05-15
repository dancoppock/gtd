import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardEditPage } from "./BoardEditPage";

const statuses = [
  { key: "todo", name: "Todo", category: "active", isSystem: false },
  { key: "in_progress", name: "In Progress", category: "active", isSystem: false },
  { key: "done", name: "Done", category: "completed", isSystem: false },
];

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

function stubBoardEditFetch(labels: unknown[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/labels") {
        return Promise.resolve(jsonResponse({ labels }));
      }

      if (url === "/api/statuses") {
        return Promise.resolve(jsonResponse({ statuses }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BoardEditPage", () => {
  it("clears the default new column name when the title input receives focus", async () => {
    stubBoardEditFetch();

    renderBoardEditPage();

    fireEvent.click(screen.getByRole("button", { name: "Add Column" }));

    const columnNameInputs = await screen.findAllByLabelText("Column Name");
    const newColumnNameInput = columnNameInputs.at(-1);

    expect(newColumnNameInput).toHaveValue("New Column");

    fireEvent.focus(newColumnNameInput as HTMLElement);

    expect(newColumnNameInput).toHaveValue("");
  });

  it("limits the default label selector to selected filter labels and clears removed defaults", async () => {
    stubBoardEditFetch([
      {
        id: "label_frontend",
        name: "frontend",
        normalizedName: "frontend",
        activeTicketCount: 1,
        archivedTicketCount: 0,
      },
      {
        id: "label_backend",
        name: "backend",
        normalizedName: "backend",
        activeTicketCount: 1,
        archivedTicketCount: 0,
      },
    ]);

    renderBoardEditPage();

    const defaultLabelSelect = await screen.findByTestId("board-default-label-input");

    expect(defaultLabelSelect).toBeDisabled();

    const frontendFilter = await screen.findByText("frontend");
    const backendFilter = await screen.findByText("backend");

    fireEvent.click(frontendFilter);
    fireEvent.click(backendFilter);

    expect(defaultLabelSelect).not.toBeDisabled();
    expect(screen.getByRole("option", { name: "frontend" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "backend" })).toBeInTheDocument();

    fireEvent.change(defaultLabelSelect, {
      target: { value: "label_frontend" },
    });

    expect(defaultLabelSelect).toHaveValue("label_frontend");

    fireEvent.click(frontendFilter);

    expect(defaultLabelSelect).toHaveValue("");
    expect(screen.queryByRole("option", { name: "frontend" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "backend" })).toBeInTheDocument();
  });

  it("requires a default label when board filter labels are selected", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/labels") {
        return Promise.resolve(jsonResponse({
          labels: [
            {
              id: "label_frontend",
              name: "frontend",
              normalizedName: "frontend",
              activeTicketCount: 1,
              archivedTicketCount: 0,
            },
          ],
        }));
      }

      if (url === "/api/statuses") {
        return Promise.resolve(jsonResponse({ statuses }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderBoardEditPage();

    fireEvent.change(await screen.findByTestId("board-name-input"), {
      target: { value: "Filtered Board" },
    });
    fireEvent.click(await screen.findByText("frontend"));
    fireEvent.click(screen.getByRole("button", { name: "Create Board" }));

    expect(
      await screen.findAllByText("Choose a default label from the board filter labels before saving."),
    ).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/boards",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
