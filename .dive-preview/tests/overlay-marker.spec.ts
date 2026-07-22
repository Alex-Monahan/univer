import { test, expect } from "@playwright/test";

/**
 * Query-mode overlays must render a subtle visual marker on the cell
 * (amber-ish background) so the user can tell at a glance which cells
 * diverge from the SQL query's current result. Direct-mode edits — which
 * produce pending UPDATE SQL — do NOT get the marker.
 */

const OVERLAY_MARKER_BG_UPPER = "#FFF8E1";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {}
  });
});

async function bindQuerySource(
  page: import("@playwright/test").Page,
  name: string,
  sql: string,
): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("univer-container")).toBeVisible();
  await expect(async () => {
    expect(
      await page.getByTestId("univer-container").locator("canvas").count(),
    ).toBeGreaterThan(0);
  }).toPass({ timeout: 45_000 });

  await expect
    .poll(
      async () =>
        page.evaluate(
          () => typeof (window as any).__univerDiveActions?.openAddSource,
        ),
      { timeout: 30_000 },
    )
    .toBe("function");

  await page.evaluate(() => {
    (window as any).__univerDiveActions.openAddSource();
  });
  await page.getByLabel(/SQL query/).check();
  await page
    .getByPlaceholder("Source name (used as the tab/storage key)")
    .fill(name);
  await page.locator("textarea").fill(sql);
  await page.getByRole("button", { name: /Probe columns/ }).click();
  await expect(page.getByTestId("ndv-id")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Create$/ }).click();
  await expect(page.locator("textarea")).toHaveCount(0, { timeout: 30_000 });
}

async function readCellBg(
  page: import("@playwright/test").Page,
  row: number,
  col: number,
): Promise<string | null> {
  return page.evaluate(
    ({ row, col }) => {
      const api = (window as any).univerAPI;
      const wb = api.getActiveWorkbook();
      const ws = wb.getActiveSheet();
      const range = ws.getRange(row, col, 1, 1);
      const bg = range.getBackgroundColor?.() ?? range.getBackground?.();
      if (bg == null) return null;
      return typeof bg === "string" ? bg : (bg.rgb ?? String(bg));
    },
    { row, col },
  );
}

test("query-mode overlay cell picks up the amber marker, removed on restore", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await bindQuerySource(
    page,
    "marker_test_src",
    "SELECT 1 AS id, 'alpha' AS label UNION ALL SELECT 2, 'beta'",
  );

  // Locate greeting/label column at id=1.
  const location = await page.evaluate(() => {
    const api = (window as any).univerAPI;
    const ws = api.getActiveWorkbook().getActiveSheet();
    const info = (ws.getSubTableInfos?.() ?? [])[0];
    const startRow = info.range.startRow;
    const startCol = info.range.startColumn;
    const width = info.range.endColumn - startCol + 1;
    const headerVals = ws
      .getRange(startRow, startCol, 1, width)
      .getValues()[0]
      .map((v: any) => (v == null ? "" : String(v)));
    const labelIdx = headerVals.indexOf("label");
    const idIdx = headerVals.indexOf("id");
    let rowFor1 = -1;
    for (let r = startRow + 1; r <= info.range.endRow; r++) {
      const v = ws.getRange(r, startCol + idIdx, 1, 1).getValues()[0][0];
      if (Number(v) === 1) {
        rowFor1 = r;
        break;
      }
    }
    return { rowFor1, labelCol: startCol + labelIdx };
  });
  expect(location.rowFor1).toBeGreaterThanOrEqual(0);

  // Before any edit, the cell should NOT carry the marker background.
  const bgBefore = await readCellBg(page, location.rowFor1, location.labelCol);
  expect((bgBefore ?? "").toUpperCase()).not.toBe(OVERLAY_MARKER_BG_UPPER);

  // Write an overlay.
  await page.evaluate(
    ({ row, col }) => {
      const api = (window as any).univerAPI;
      const ws = api.getActiveWorkbook().getActiveSheet();
      ws.getRange(row, col, 1, 1).setValues([["ALPHA-EDITED"]]);
    },
    { row: location.rowFor1, col: location.labelCol },
  );
  await page.waitForTimeout(250);

  const bgAfterEdit = await readCellBg(
    page,
    location.rowFor1,
    location.labelCol,
  );
  expect((bgAfterEdit ?? "").toUpperCase()).toBe(OVERLAY_MARKER_BG_UPPER);

  // Clear the cell — overlay is restored to original and marker should clear.
  await page.evaluate(
    ({ row, col }) => {
      const api = (window as any).univerAPI;
      const ws = api.getActiveWorkbook().getActiveSheet();
      ws.getRange(row, col, 1, 1).setValues([[null]]);
    },
    { row: location.rowFor1, col: location.labelCol },
  );
  await page.waitForTimeout(250);

  const bgAfterRestore = await readCellBg(
    page,
    location.rowFor1,
    location.labelCol,
  );
  expect((bgAfterRestore ?? "").toUpperCase()).not.toBe(OVERLAY_MARKER_BG_UPPER);

  expect(pageErrors).toEqual([]);
});

test("direct-mode edits do NOT receive the overlay marker", async ({
  page,
}) => {
  // We can't easily bind a direct MotherDuck table in CI without a known
  // target, so simulate by building a fake direct source entry directly in
  // the sources registry and exercising handleCellMutation with it.
  await page.goto("/");
  await expect(page.getByTestId("univer-container")).toBeVisible();
  await expect(async () => {
    expect(
      await page.getByTestId("univer-container").locator("canvas").count(),
    ).toBeGreaterThan(0);
  }).toPass({ timeout: 45_000 });

  await expect
    .poll(
      async () =>
        page.evaluate(
          () => typeof (window as any).__univerDiveActions?.openAddSource,
        ),
      { timeout: 30_000 },
    )
    .toBe("function");

  // Bind a query source just so we have a Univer table in the sheet, then
  // mutate the sources registry to relabel it as direct-mode. This lets us
  // exercise the direct-mode branch without needing a real MotherDuck table.
  await bindQuerySource(
    page,
    "direct_fake_src",
    "SELECT 1 AS id, 'alpha' AS label UNION ALL SELECT 2, 'beta'",
  );

  await page.evaluate(() => {
    const raw = localStorage.getItem("univer-dive-sources") ?? "{}";
    const reg = JSON.parse(raw);
    const key = Object.keys(reg)[0];
    reg[key] = {
      mode: "direct",
      database: "fake_db",
      schema: "main",
      table: "t",
      pkColumns: reg[key].pkColumns,
      pkTypes: reg[key].pkTypes ?? {},
      storageKey: "fake_db.main.t",
    };
    localStorage.setItem("univer-dive-sources", JSON.stringify(reg));
  });

  const location = await page.evaluate(() => {
    const api = (window as any).univerAPI;
    const ws = api.getActiveWorkbook().getActiveSheet();
    const info = (ws.getSubTableInfos?.() ?? [])[0];
    const startRow = info.range.startRow;
    const startCol = info.range.startColumn;
    const width = info.range.endColumn - startCol + 1;
    const headerVals = ws
      .getRange(startRow, startCol, 1, width)
      .getValues()[0]
      .map((v: any) => (v == null ? "" : String(v)));
    const labelIdx = headerVals.indexOf("label");
    return { rowFirst: startRow + 1, labelCol: startCol + labelIdx };
  });

  await page.evaluate(
    ({ row, col }) => {
      const api = (window as any).univerAPI;
      const ws = api.getActiveWorkbook().getActiveSheet();
      ws.getRange(row, col, 1, 1).setValues([["DIRECT-EDIT"]]);
    },
    { row: location.rowFirst, col: location.labelCol },
  );
  await page.waitForTimeout(250);

  const bgAfter = await readCellBg(page, location.rowFirst, location.labelCol);
  expect((bgAfter ?? "").toUpperCase()).not.toBe(OVERLAY_MARKER_BG_UPPER);
});
