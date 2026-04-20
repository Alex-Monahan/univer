import { test, expect } from "@playwright/test";

const STORAGE_KEY = "univer-dive-workbook-v1";

test("writes a cell and persists it to localStorage", async ({ page }) => {
  // Start fresh, then let reloads see persisted state. (addInitScript would
  // clear localStorage on every page load including reload, so use a one-shot
  // first-load navigation + cleanup.)
  await page.goto("/");
  await page.evaluate((k: string) => localStorage.removeItem(k), STORAGE_KEY);
  await page.reload();
  await page.waitForFunction(() => (window as any).univerAPI, null, { timeout: 30000 });

  // Write a cell via the facade API — simulates an edit without relying on
  // keyboard/mouse mechanics (which are flaky across OS targets).
  await page.evaluate(async () => {
    const api = (window as any).univerAPI;
    const wb = api.getActiveWorkbook();
    const ws = wb.getActiveSheet();
    await ws.getRange(1, 6).setValue("hello-from-test");
  });

  // Give the debounced save (250ms) time to fire and verify that the live
  // snapshot also has the value (rules out a bug where setValue doesn't
  // commit to the workbook's serialized state).
  await page.waitForTimeout(500);
  const preReload = await page.evaluate((k: string) => {
    const api = (window as any).univerAPI;
    const wb = api.getActiveWorkbook();
    const ws = wb.getActiveSheet();
    return {
      liveRange: ws.getRange(1, 6).getValue(),
      savedHasHello: (localStorage.getItem(k) || "").includes("hello-from-test"),
      liveSnapRow1: wb.save()?.sheets?.["sheet-01"]?.cellData?.[1],
    };
  }, STORAGE_KEY);
  console.log("PRE-RELOAD:", JSON.stringify(preReload, null, 2));
  expect(preReload.liveRange).toBe("hello-from-test");
  expect(preReload.savedHasHello).toBe(true);

  // Dump the actual saved snapshot to see what row 1 looks like.
  const savedSnapStr = await page.evaluate((k: string) => localStorage.getItem(k)!, STORAGE_KEY);
  const savedSnap = JSON.parse(savedSnapStr);
  console.log("SAVED ROW 1:", JSON.stringify(savedSnap?.sheets?.["sheet-01"]?.cellData?.[1]));
  console.log("SAVED HAS ROW 1:", !!savedSnap?.sheets?.["sheet-01"]?.cellData?.[1]);

  // Reload: the saved snapshot should replace the (empty) SQL path.
  await page.reload();
  await page.waitForFunction(() => (window as any).univerAPI, null, { timeout: 30000 });

  const debug = await page.evaluate((k: string) => {
    const snap = localStorage.getItem(k);
    const api = (window as any).univerAPI;
    const wb = api?.getActiveWorkbook?.();
    const ws = wb?.getActiveSheet?.();
    const r = ws?.getRange?.(1, 6);
    return {
      snapPreview: snap?.slice(0, 1500),
      snapContainsHello: snap?.includes("hello-from-test") ?? false,
      hasWb: !!wb,
      hasWs: !!ws,
      rawRange: r?.getValue?.(),
      sheetSnap: wb?.save?.()?.sheets,
    };
  }, STORAGE_KEY);
  console.log("DEBUG:", JSON.stringify(debug, null, 2).slice(0, 4000));
  expect(debug.snapContainsHello).toBe(true);
  expect(debug.rawRange).toBe("hello-from-test");
});
