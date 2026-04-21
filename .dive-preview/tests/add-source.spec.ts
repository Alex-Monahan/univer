import { test, expect } from "@playwright/test";

/**
 * Full Add-Source → Univer Table binding flow. Requires a real MotherDuck
 * token in the browser bundle — pass VITE_MOTHERDUCK_TOKEN when running:
 *   VITE_MOTHERDUCK_TOKEN=$motherduck_token npx playwright test add-source
 * The Vite dev server picks the env var up via process.env (takes precedence
 * over the placeholder in .env).
 */

test.beforeEach(async ({ page }) => {
  // Wipe any workbook / source / edit state so each run starts from the
  // default snapshot.
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {}
  });
});

test("query-mode source binds to a univer table and lands in localStorage", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/");

  // Wait for Univer to mount its canvas.
  const container = page.getByTestId("univer-container");
  await expect(container).toBeVisible();
  await expect(async () => {
    expect(await container.locator("canvas").count()).toBeGreaterThan(0);
  }).toPass({ timeout: 45_000 });

  // Runtime + workbook are ready when the Add-Source button renders.
  const addBtn = page.getByTestId("add-source-button");
  await expect(addBtn).toBeVisible();

  await addBtn.click();

  // Select SQL-query mode (default is direct).
  await page.getByLabel(/SQL query/).check();

  await page
    .getByPlaceholder("Source name (used as the tab/storage key)")
    .fill("dive_test_src");

  await page
    .locator("textarea")
    .fill("SELECT 1 AS id, 'hello' AS greeting UNION ALL SELECT 2, 'world'");

  // Probe columns — this issues DESCRIBE + approx_count_distinct against
  // MotherDuck. The PK picker appears once it resolves.
  await page.getByRole("button", { name: /Probe columns/ }).click();

  // "id" and "greeting" checkboxes should appear in the PK picker.
  const idLabel = page.locator("label", { hasText: "id" }).first();
  const greetingLabel = page.locator("label", { hasText: "greeting" }).first();
  await expect(idLabel).toBeVisible({ timeout: 30_000 });
  await expect(greetingLabel).toBeVisible();

  // Create the table. The "Create" button says "Creating…" while in-flight.
  await page.getByRole("button", { name: /^Create$/ }).click();

  // Modal unmounts — the textarea is gone.
  await expect(page.locator("textarea")).toHaveCount(0, { timeout: 30_000 });

  // Verify the sources registry contains exactly our entry.
  const reg = await page.evaluate(() => {
    const raw = localStorage.getItem("univer-dive-sources");
    return raw ? JSON.parse(raw) : null;
  });
  expect(reg).not.toBeNull();
  const entries = Object.values(reg as Record<string, any>);
  expect(entries).toHaveLength(1);
  const entry = entries[0] as any;
  expect(entry.mode).toBe("query");
  expect(entry.name).toBe("dive_test_src");
  expect(entry.storageKey).toBe("query:dive_test_src");
  expect(entry.pkColumns.length).toBeGreaterThan(0);

  // Verify the workbook now has a bound Univer Table.
  const tableCount = await page.evaluate(() => {
    const api = (window as any).univerAPI;
    const wb = api?.getActiveWorkbook?.();
    const list = wb?.getTableList?.() ?? [];
    return list.length;
  });
  expect(tableCount).toBeGreaterThanOrEqual(1);

  // Verify an empty edit store was seeded.
  const editStoreRaw = await page.evaluate(() =>
    localStorage.getItem("univer-dive-edits:query:dive_test_src"),
  );
  expect(editStoreRaw).not.toBeNull();

  expect(pageErrors).toEqual([]);
});
