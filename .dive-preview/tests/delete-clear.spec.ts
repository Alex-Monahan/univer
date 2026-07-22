import { test, expect } from "@playwright/test";

// Regression guard for the "Delete/Backspace does nothing + console TypeError"
// bug that md-sheet had to monkey-patch on Univer 0.21: the Delete shortcut
// fires `sheet.command.clear-selection-content` with NO params, and the sheet
// permission check read `params.ranges` unconditionally, throwing before the
// command handler ran — so the cell was never cleared.
//
// We assert the BEHAVIOUR (cell actually clears) and the ABSENCE of errors,
// via two paths: a direct paramless command dispatch (deterministic repro of
// the shortcut) and a real keyboard Delete on a focused cell.

async function bootGrid(page: any, errors: string[]) {
  page.on("pageerror", (e: Error) => errors.push("PAGEERROR: " + String(e)));
  page.on("console", (msg: any) => {
    if (msg.type() === "error") errors.push("CONSOLE: " + msg.text());
  });
  await page.goto("/");
  await expect(page.getByTestId("univer-container")).toBeVisible();
  await expect(async () => {
    const ok = await page.evaluate(
      () => !!(window as any).univerAPI?.getActiveWorkbook?.()
    );
    expect(ok).toBe(true);
  }).toPass({ timeout: 45000 });
}

// Only errors that indicate the permission-check regression (a thrown
// TypeError reading .ranges, or a permission abort). Unrelated md-sdk
// connection noise ("MD_EVENT", token warnings) is ignored.
function relevant(errors: string[]) {
  return errors.filter((e) =>
    /ranges|permission|clear-selection|TypeError|Cannot read/i.test(e)
  );
}

test("Delete via paramless clear-selection-content command clears the cell", async ({
  page,
}) => {
  const errors: string[] = [];
  await bootGrid(page, errors);

  const result = await page.evaluate(async () => {
    const api = (window as any).univerAPI;
    const ws = api.getActiveWorkbook().getActiveSheet();
    const cell = ws.getRange(1, 0, 1, 1);
    cell.setValue("delete-me");
    cell.activate?.();
    // Exactly what ClearSelectionValueShortcutItem dispatches: the command id
    // with no params object.
    let threw: string | null = null;
    try {
      await api.executeCommand("sheet.command.clear-selection-content");
    } catch (e: any) {
      threw = String(e?.message ?? e);
    }
    return { threw, after: ws.getRange(1, 0, 1, 1).getValue() };
  });

  expect(result.threw, "command must not throw").toBeNull();
  expect(result.after ?? "", "cell must be cleared").toBe("");
  expect(relevant(errors), relevant(errors).join("\n")).toHaveLength(0);
});

test("Delete key on a focused cell clears it without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  await bootGrid(page, errors);

  // Seed a value and put the selection on it via the facade.
  await page.evaluate(async () => {
    const api = (window as any).univerAPI;
    const ws = api.getActiveWorkbook().getActiveSheet();
    const cell = ws.getRange(2, 1, 1, 1); // C3
    cell.setValue("kbd-delete");
    cell.activate?.();
  });

  // Click into the grid to give the sheet editor DOM focus (the Delete
  // shortcut precondition is whenSheetEditorFocused), then press Delete.
  // Canvas layers are stacked/overlaid, so bypass actionability with force.
  const container = page.getByTestId("univer-container");
  await container.click({ position: { x: 120, y: 60 }, force: true });
  // Re-assert selection on our seeded cell (the click moved it) and clear.
  await page.evaluate(async () => {
    const api = (window as any).univerAPI;
    const ws = api.getActiveWorkbook().getActiveSheet();
    ws.getRange(2, 1, 1, 1).activate?.();
  });
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => {
    const api = (window as any).univerAPI;
    const ws = api.getActiveWorkbook().getActiveSheet();
    return ws.getRange(2, 1, 1, 1).getValue();
  });

  expect(after ?? "", "cell must be cleared by Delete key").toBe("");
  expect(relevant(errors), relevant(errors).join("\n")).toHaveLength(0);
});
