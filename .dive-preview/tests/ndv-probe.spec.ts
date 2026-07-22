import { test, expect } from "@playwright/test";

/**
 * NDV count in the PK picker must reflect reality. For a query with known
 * cardinality, the distinct-count span must show a non-zero number.
 *
 * Requires VITE_MOTHERDUCK_TOKEN in the env (Vite bakes it in; the wasm
 * client connects and runs DESCRIBE + approx_count_distinct live).
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {}
  });
});

test("PK-picker NDV shows real distinct counts, not 0", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/");

  const container = page.getByTestId("univer-container");
  await expect(container).toBeVisible();
  await expect(async () => {
    expect(await container.locator("canvas").count()).toBeGreaterThan(0);
  }).toPass({ timeout: 45_000 });

  // Wait for the dive's ribbon actions to register on window.
  await expect
    .poll(
      async () =>
        page.evaluate(
          () => typeof (window as any).__univerDiveActions?.openAddSource,
        ),
      { timeout: 30_000 },
    )
    .toBe("function");

  // Open Add-Source modal (the +Add Source ribbon entry dispatches this).
  await page.evaluate(() => {
    (window as any).__univerDiveActions.openAddSource();
  });

  await page.getByLabel(/SQL query/).check();
  await page
    .getByPlaceholder("Source name (used as the tab/storage key)")
    .fill("ndv_test_src");

  // 10 rows with distinct `id`, 2 distinct `tier`. Cardinalities are exact.
  const sql =
    "SELECT i AS id, CASE WHEN i % 2 = 0 THEN 'even' ELSE 'odd' END AS tier " +
    "FROM range(1, 11) t(i)";
  await page.locator("textarea").fill(sql);
  await page.getByRole("button", { name: /Probe columns/ }).click();

  // PK picker renders once the probe resolves.
  const idNdv = page.getByTestId("ndv-id");
  const tierNdv = page.getByTestId("ndv-tier");
  await expect(idNdv).toBeVisible({ timeout: 30_000 });
  await expect(tierNdv).toBeVisible();

  const idText = (await idNdv.textContent()) ?? "";
  const tierText = (await tierNdv.textContent()) ?? "";

  // Extract the number printed inside (≈ N distinct).
  const parse = (s: string): number | null => {
    const m = s.match(/≈\s*(\d+)/);
    return m ? Number(m[1]) : null;
  };
  const idCount = parse(idText);
  const tierCount = parse(tierText);

  // The original bug: both came back as 0 because probeSource's second runSql
  // was resolving with stale DESCRIBE rows from the prior dispatch. A real
  // distinct count must now land — approx_count_distinct is HyperLogLog, so
  // we allow a small envelope around the true values (10 and 2).
  expect(idCount, `id NDV text was: "${idText}"`).not.toBe(0);
  expect(tierCount, `tier NDV text was: "${tierText}"`).not.toBe(0);
  expect(idCount).toBeGreaterThanOrEqual(5);
  expect(idCount).toBeLessThanOrEqual(15);
  expect(tierCount).toBeGreaterThanOrEqual(1);
  expect(tierCount).toBeLessThanOrEqual(5);

  expect(pageErrors).toEqual([]);
});
