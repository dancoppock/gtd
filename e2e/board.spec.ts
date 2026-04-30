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

test("edits a ticket and persists the change after reload", async ({ page }) => {
  await page.getByRole("button", { name: "Edit Design ticket modal" }).click();
  await expect(page.getByRole("dialog", { name: "Edit Ticket" })).toBeVisible();

  await page.getByTestId("ticket-modal-title-input").fill("Design ticket modal v2");
  await page.getByLabel("Priority").selectOption("low");
  await page.getByTestId("ticket-modal-labels-input").fill("frontend, ux");
  await page.getByTestId("ticket-modal-submit").click();

  await expect(page.getByTestId("column-todo")).toContainText("Design ticket modal v2");

  await page.reload();
  await expect(page.getByTestId("column-todo")).toContainText("Design ticket modal v2");
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
