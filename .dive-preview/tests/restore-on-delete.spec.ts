import { test, expect } from "@playwright/test";

/**
 * Deleting a cell that had previously been edited (overlay present) should:
 *   1. Drop the overlay entry entirely from localStorage (not store `null`).
 *   2. Restore the DB original into that cell.
 *   3. Not log an UPDATE (the row never diverged).
 *
 * Driven end-to-end through the Univer facade: bind a query source, edit a
 * non-PK cell, clear it, and inspect both the rendered cell and the
 * localStorage edit store.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {}
  });
});

test("clearing an overlaid cell restores DB value and removes overlay entry", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const diveLogs: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[dive:")) diveLogs.push(text);
  });

  await page.goto("/");

  const container = page.getByTestId("univer-container");
  await expect(container).toBeVisible();
  await expect(async () => {
    expect(await container.locator("canvas").count()).toBeGreaterThan(0);
  }).toPass({ timeout: 45_000 });

  // Wait until dive ribbon actions register.
  await expect
    .poll(
      async () =>
        page.evaluate(
          () => typeof (window as any).__univerDiveActions?.openAddSource,
        ),
      { timeout: 30_000 },
    )
    .toBe("function");

  // Bind a query source: id (PK) + greeting (non-PK). Known original value
  // at id=1 is 'hello'.
  await page.evaluate(() => {
    (window as any).__univerDiveActions.openAddSource();
  });
  await page.getByLabel(/SQL query/).check();
  await page
    .getByPlaceholder("Source name (used as the tab/storage key)")
    .fill("restore_test_src");
  await page
    .locator("textarea")
    .fill("SELECT 1 AS id, 'hello' AS greeting UNION ALL SELECT 2, 'world'");
  await page.getByRole("button", { name: /Probe columns/ }).click();
  const idNdv = page.getByTestId("ndv-id");
  await expect(idNdv).toBeVisible({ timeout: 30_000 });
  // id is auto-selected as PK (highest cardinality). Create.
  await page.getByRole("button", { name: /^Create$/ }).click();
  await expect(page.locator("textarea")).toHaveCount(0, { timeout: 30_000 });

  const storageKey = "query:restore_test_src";

  // Locate the greeting column and the data row for id=1. We'll use the
  // Univer facade imperatively rather than clicking cells, which is more
  // reliable than driving the canvas through mouse events.
  const location = await page.evaluate(() => {
    const api = (window as any).univerAPI;
    const wb = api.getActiveWorkbook();
    const ws = wb.getActiveSheet();
    const info = (ws.getSubTableInfos?.() ?? [])[0];
    const startRow = info.range.startRow;
    const startCol = info.range.startColumn;
    const width = info.range.endColumn - startCol + 1;
    const headerVals = ws
      .getRange(startRow, startCol, 1, width)
      .getValues()[0]
      .map((v: any) => (v == null ? "" : String(v)));
    const greetingIdx = headerVals.indexOf("greeting");
    const idIdx = headerVals.indexOf("id");
    const dataStart = startRow + 1;
    // Find the row where id = 1.
    let rowFor1 = -1;
    for (let r = dataStart; r <= info.range.endRow; r++) {
      const v = ws.getRange(r, startCol + idIdx, 1, 1).getValues()[0][0];
      if (Number(v) === 1) {
        rowFor1 = r;
        break;
      }
    }
    return {
      rowFor1,
      greetingCol: startCol + greetingIdx,
    };
  });
  expect(location.rowFor1).toBeGreaterThanOrEqual(0);

  // Step 1: edit the greeting cell from 'hello' → 'HOWDY'.
  await page.evaluate(
    ({ row, col }) => {
      const api = (window as any).univerAPI;
      const ws = api.getActiveWorkbook().getActiveSheet();
      ws.getRange(row, col, 1, 1).setValues([["HOWDY"]]);
    },
    { row: location.rowFor1, col: location.greetingCol },
  );

  // Overlay should be present in localStorage.
  const overlayAfterEdit = await page.evaluate((key) => {
    const raw = localStorage.getItem("univer-dive-edits:" + key);
    return raw ? JSON.parse(raw) : null;
  }, storageKey);
  expect(overlayAfterEdit).not.toBeNull();
  const overlays = overlayAfterEdit.overlays;
  const pkKeys = Object.keys(overlays);
  expect(pkKeys).toHaveLength(1);
  expect(overlays[pkKeys[0]].greeting).toBeTruthy();
  expect(overlays[pkKeys[0]].greeting.value).toBe("HOWDY");
  expect(overlays[pkKeys[0]].greeting.original).toBe("hello");

  // Step 2: delete that cell (set to null).
  await page.evaluate(
    ({ row, col }) => {
      const api = (window as any).univerAPI;
      const ws = api.getActiveWorkbook().getActiveSheet();
      ws.getRange(row, col, 1, 1).setValues([[null]]);
    },
    { row: location.rowFor1, col: location.greetingCol },
  );

  // Wait briefly for the synchronous restore to propagate.
  await page.waitForTimeout(200);

  // Step 3a: cell should now display the original 'hello', not blank.
  const cellAfterDelete = await page.evaluate(
    ({ row, col }) => {
      const api = (window as any).univerAPI;
      const ws = api.getActiveWorkbook().getActiveSheet();
      return ws.getRange(row, col, 1, 1).getValues()[0][0];
    },
    { row: location.rowFor1, col: location.greetingCol },
  );
  expect(cellAfterDelete).toBe("hello");

  // Step 3b: overlay entry for `greeting` is gone; pkKey map should be
  // empty and pruned. localStorage must NOT carry a `value: null` entry.
  const storeAfterDelete = await page.evaluate((key) => {
    const raw = localStorage.getItem("univer-dive-edits:" + key);
    return raw ? JSON.parse(raw) : null;
  }, storageKey);
  expect(storeAfterDelete).not.toBeNull();
  expect(storeAfterDelete.overlays).toEqual({});

  // Step 3c: no would-update / query-overlay line for the delete; a
  // restored-from-overlay line should be present.
  const hadRestore = diveLogs.some((l) =>
    l.includes("[dive:restored-from-overlay]"),
  );
  expect(hadRestore).toBe(true);
  const postDeleteUpdate = diveLogs
    .slice(diveLogs.findIndex((l) => l.includes("[dive:restored-from-overlay]")))
    .some(
      (l) =>
        l.includes("[dive:would-update]") || l.includes("[dive:query-overlay]"),
    );
  expect(postDeleteUpdate).toBe(false);

  expect(pageErrors).toEqual([]);
});

test("clearing a DB value with no prior overlay logs UPDATE but stores no overlay", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const diveLogs: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[dive:")) diveLogs.push(text);
  });

  await page.goto("/");

  const container = page.getByTestId("univer-container");
  await expect(container).toBeVisible();
  await expect(async () => {
    expect(await container.locator("canvas").count()).toBeGreaterThan(0);
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
    .fill("clear_db_src");
  await page
    .locator("textarea")
    .fill("SELECT 1 AS id, 'alpha' AS label UNION ALL SELECT 2, 'beta'");
  await page.getByRole("button", { name: /Probe columns/ }).click();
  await expect(page.getByTestId("ndv-id")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Create$/ }).click();
  await expect(page.locator("textarea")).toHaveCount(0, { timeout: 30_000 });

  const storageKey = "query:clear_db_src";

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

  // Clear the label cell on id=1 directly (no prior edit → no overlay).
  await page.evaluate(
    ({ row, col }) => {
      const api = (window as any).univerAPI;
      const ws = api.getActiveWorkbook().getActiveSheet();
      ws.getRange(row, col, 1, 1).setValues([[null]]);
    },
    { row: location.rowFor1, col: location.labelCol },
  );
  await page.waitForTimeout(200);

  // The cell stays blank (no overlay to restore from).
  const cellAfterDelete = await page.evaluate(
    ({ row, col }) => {
      const api = (window as any).univerAPI;
      const ws = api.getActiveWorkbook().getActiveSheet();
      return ws.getRange(row, col, 1, 1).getValues()[0][0];
    },
    { row: location.rowFor1, col: location.labelCol },
  );
  expect(cellAfterDelete).toBeNull();

  // Overlay store must remain empty — no `{value: null, original: "alpha"}`.
  const store = await page.evaluate((key) => {
    const raw = localStorage.getItem("univer-dive-edits:" + key);
    return raw ? JSON.parse(raw) : null;
  }, storageKey);
  expect(store).not.toBeNull();
  expect(store.overlays).toEqual({});

  // A [dive:query-clear] line must appear (query mode) and no
  // [dive:query-overlay] line — we logged the clear but did not persist.
  const clearLogs = diveLogs.filter((l) => l.includes("[dive:query-clear]"));
  expect(clearLogs.length).toBeGreaterThan(0);
  const overlayLogs = diveLogs.filter((l) =>
    l.includes("[dive:query-overlay]"),
  );
  expect(overlayLogs.length).toBe(0);
  const restoreLogs = diveLogs.filter((l) =>
    l.includes("[dive:restored-from-overlay]"),
  );
  expect(restoreLogs.length).toBe(0);

  expect(pageErrors).toEqual([]);
});
