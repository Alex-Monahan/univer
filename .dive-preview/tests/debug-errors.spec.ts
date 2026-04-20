import { test } from "@playwright/test";

test("capture errors", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push("PAGE: " + e.message + "\n" + e.stack));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) {
      errs.push(m.type().toUpperCase() + ": " + m.text());
    }
  });
  await page.goto("/");
  await page.waitForTimeout(15000);
  const html = await page.content();
  console.log("\n===ERRORS===\n" + errs.join("\n---\n"));
  console.log("\n===BODY (first 3KB)===\n" + html.slice(0, 3000));
});
