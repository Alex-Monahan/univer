import { test, expect } from "@playwright/test";

test("univer grid renders inside the dive", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/");

  // Wait for the univer container to exist.
  const container = page.getByTestId("univer-container");
  await expect(container).toBeVisible();

  // Wait for univer to initialize — it mounts canvas(es) into the container.
  await expect(async () => {
    const canvasCount = await container.locator("canvas").count();
    expect(canvasCount).toBeGreaterThan(0);
  }).toPass({ timeout: 45000 });

  // A sheet grid should be present (univer uses a formula bar + toolbar + grid).
  // Check there is no global init-failure error banner.
  await expect(page.locator("pre")).toHaveCount(0);

  // Univer exposes its API on window after initialization.
  const hasAPI = await page.evaluate(() => {
    return !!(window as any).univerAPI && !!(window as any).univer;
  });
  expect(hasAPI).toBe(true);

  // The active workbook should have at least one sheet.
  const sheetInfo = await page.evaluate(() => {
    const api = (window as any).univerAPI;
    const wb = api.getActiveWorkbook();
    if (!wb) return { hasWorkbook: false };
    const sheets = wb.getSheets();
    return {
      hasWorkbook: true,
      sheetCount: sheets.length,
      firstName: sheets[0]?.getSheetName?.(),
    };
  });
  expect(sheetInfo.hasWorkbook).toBe(true);
  expect(sheetInfo.sheetCount).toBeGreaterThan(0);

  if (pageErrors.length) {
    console.log("PAGE ERRORS:\n" + pageErrors.join("\n---\n"));
    throw new Error("page errors detected");
  }
  if (consoleErrors.length) {
    console.log("CONSOLE ERRORS:\n" + consoleErrors.join("\n---\n"));
  }
});
