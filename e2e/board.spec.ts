import { expect, test } from "@playwright/test";

const apiBaseURL = "http://127.0.0.1:3101";

async function resetBoardState() {
  const response = await fetch(`${apiBaseURL}/api/test/reset`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to reset test board state: ${response.status}`);
  }
}

test.beforeEach(async ({ page }) => {
  await resetBoardState();
  await page.goto("/boards/default");
  await expect(page.getByRole("heading", { name: "My Board" })).toBeVisible();
});

test("loads the seeded kanban board", async ({ page }) => {
  await expect(page.getByTestId("column-todo")).toContainText("Design ticket modal");
  await expect(page.getByTestId("column-in_progress")).toContainText("Build board API route");
  await expect(page.getByTestId("column-done")).toContainText("Seed default board");
});

test("filters tickets by priority, label, and search text", async ({ page }) => {
  await page.getByRole("button", { name: "Expand filters panel" }).click();
  await page.getByTestId("priority-filter-highest").click({ force: true });
  await page.getByTestId("label-filter-backend").click({ force: true });
  await page.getByTestId("filters-search").fill("route");

  await expect(page.getByText("Build board API route")).toBeVisible();
  await expect(page.getByText("Design ticket modal")).not.toBeVisible();
  await expect(page.getByText("Seed default board")).not.toBeVisible();

  await page.getByTestId("clear-filters").click();
  await expect(page.getByText("Design ticket modal")).toBeVisible();
});

test("creates a ticket and persists it after reload", async ({ page }) => {
  await page.getByRole("button", { name: "New Ticket" }).click();
  await expect(page.getByRole("dialog", { name: "Create Ticket" })).toBeVisible();

  await page.getByTestId("ticket-modal-title-input").fill("Automation smoke ticket");
  await page.getByTestId("ticket-modal-description-input").fill("Created by Playwright smoke test.");
  await page.getByLabel("Priority").selectOption("high");
  await page.getByTestId("ticket-modal-labels-input").fill("qa, automation");
  await page.getByTestId("ticket-modal-submit").click();

  await expect(page.getByTestId("column-todo")).toContainText("Automation smoke ticket");

  await page.reload();
  await expect(page.getByTestId("column-todo")).toContainText("Automation smoke ticket");
});

test("drags a ticket into another column and keeps it there after reload", async ({ page }) => {
  const ticketCard = page.getByTestId("ticket-ticket_1");
  const targetColumn = page.getByTestId("column-body-done");
  const handleBox = await ticketCard.boundingBox();
  const targetBox = await targetColumn.boundingBox();

  if (!handleBox || !targetBox) {
    throw new Error("Drag source or target is not visible");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();

  const repositionResponse = page.waitForResponse((response) =>
    response.url().includes("/api/tickets/ticket_1/reposition") && response.ok(),
  );

  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + Math.min(48, targetBox.height / 2),
    { steps: 20 },
  );
  await page.mouse.up();
  await repositionResponse;

  await expect(page.getByTestId("column-done")).toContainText("Design ticket modal");
  await expect(page.getByTestId("column-todo")).not.toContainText("Design ticket modal");

  await page.reload();
  await expect(page.getByTestId("column-done")).toContainText("Design ticket modal");
});

test("archives done tickets and keeps them hidden after reload", async ({ page }) => {
  const archiveResponse = page.waitForResponse((response) =>
    response.url().includes("/api/boards/board_default/archive-done") && response.ok(),
  );

  await page.getByTestId("column-archive-done").click();
  await archiveResponse;

  await expect(page.getByTestId("column-done")).not.toContainText("Seed default board");
  await expect(page.getByTestId("column-done")).toContainText("0 tickets");

  await page.reload();
  await expect(page.getByTestId("column-done")).not.toContainText("Seed default board");
  await expect(page.getByTestId("column-done")).toContainText("0 tickets");
});

test("navigates to labels and manages them globally", async ({ page }) => {
  await page.getByRole("link", { name: "Labels" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Labels" })).toBeVisible();
  await expect(page.getByTestId("label-row-backend")).toBeVisible();
  await expect(page.getByTestId("label-row-backend")).toContainText("(2 tickets, 0 archived)");

  await page.getByTestId("label-edit-frontend").click();
  await page.getByTestId("label-input-label_frontend").fill("ux");
  await page.getByTestId("label-save-label_frontend").click();
  await expect(page.getByTestId("label-row-ux")).toBeVisible();

  await page.getByTestId("label-delete-backend").click();
  await expect(page.getByTestId("label-row-backend")).toHaveCount(0);

  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("button", { name: "Expand filters panel" }).click();
  await expect(page.getByTestId("label-filter-ux")).toBeVisible();
  await expect(page.getByTestId("label-filter-backend")).toHaveCount(0);
});

test("creates a filtered board from the boards page", async ({ page }) => {
  await page.getByRole("link", { name: "Boards" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Boards" })).toBeVisible();
  await page.getByRole("link", { name: "Create Board" }).click();

  await page.getByTestId("board-name-input").fill("Frontend Work");
  await page.getByTestId("board-description-input").fill("Only show frontend tickets");
  await page.getByRole("checkbox", { name: "frontend" }).click({ force: true });
  await page.getByRole("button", { name: "Create Board" }).click();

  await expect(page).toHaveURL(/\/boards\/frontend-work$/);
  await expect(page.getByRole("heading", { name: "Frontend Work" })).toBeVisible();
  await expect(page.getByTestId("column-todo")).toContainText("Design ticket modal");
  await expect(page.getByTestId("column-in_progress")).not.toContainText("Build board API route");
  await expect(page.getByTestId("column-done")).not.toContainText("Seed default board");
});
