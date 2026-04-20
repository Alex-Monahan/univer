import { test, expect } from "@playwright/test";

test("screenshot", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="univer-container"] canvas', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/univer-rendered.png", fullPage: true });
  await expect(page.getByTestId("univer-container")).toBeVisible();
});
