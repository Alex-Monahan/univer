#!/usr/bin/env node
/**
 * Builds .dive-preview/src/dive.tsx by splicing inlined univer UMD bundles
 * into dive-template.tsx.
 *
 * - Univer packages are kept as readable JS (not minified further / not
 *   compressed), so the logic is inspectable inside dive.tsx.
 * - Peer dependencies (rxjs, redi, themes, protocol) and locales are gzipped+
 *   base64 encoded to save space — these aren't univer logic, just infra/data.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const VENDOR = resolve(ROOT, "vendor-cache");
const TEMPLATE = resolve(HERE, "dive-template.tsx");
const OUT = resolve(ROOT, "src", "dive.tsx");

const DEP_FILES = [
  "rxjs.js",
  "redi.js",
  "redi-react.js",
  "themes.js",
  "protocol.js",
];

const LOCALE_FILES = [
  "design.enUS.js",
  "ui.enUS.js",
  "docs-ui.enUS.js",
  "sheets.enUS.js",
  "sheets-ui.enUS.js",
  "sheets-formula-ui.enUS.js",
  "sheets-numfmt-ui.enUS.js",
];

// Load order mirrors examples/umd/sheets.html in the univer repo. Each package
// can only reference globals that were registered by an earlier script.
const UNIVER_CORE = [
  "core.js",
  "telemetry.js",
  "rpc.js",
  "design.js",
  "engine-render.js",
  "engine-formula.js",
  "drawing.js",
  "ui.js",
  "docs.js",
  "docs-ui.js",
  "sheets.js",
  "sheets-ui.js",
  "sheets-formula.js",
  "sheets-formula-ui.js",
  "sheets-numfmt.js",
  "sheets-numfmt-ui.js",
];

const UNIVER_FACADES = [
  "core.facade.js",
  "engine-formula.facade.js",
  "ui.facade.js",
  "docs-ui.facade.js",
  "sheets.facade.js",
  "sheets-ui.facade.js",
  "sheets-formula.facade.js",
  "sheets-numfmt.facade.js",
];

const CSS_FILES = [
  "design.css",
  "ui.css",
  "docs-ui.css",
  "sheets-ui.css",
  "sheets-formula-ui.css",
  "sheets-numfmt-ui.css",
];

function readVendor(name) {
  const p = resolve(VENDOR, name);
  if (!existsSync(p)) throw new Error(`Missing vendor file: ${p}`);
  return readFileSync(p, "utf8");
}

function toB64Gzip(text) {
  return gzipSync(Buffer.from(text, "utf8"), { level: 9 }).toString("base64");
}

function makeBlob(files) {
  const parts = files.map((f) =>
    JSON.stringify({ name: f, code: readVendor(f) })
  );
  return toB64Gzip("[" + parts.join(",") + "]");
}

function jsQuote(text) {
  return JSON.stringify(text);
}

function makeReadableSection(files) {
  const entries = files.map((f) => {
    const body = readVendor(f);
    return `  // ==== ${f} (${body.length} bytes) ====\n  ${jsQuote(body)}`;
  });
  return "[\n" + entries.join(",\n") + "\n]";
}

const depBlob = makeBlob(DEP_FILES);
const localeBlob = makeBlob(LOCALE_FILES);
const univerCoreSection = makeReadableSection(UNIVER_CORE);
const univerFacadeSection = makeReadableSection(UNIVER_FACADES);
const cssSection = makeReadableSection(CSS_FILES);

console.log("[build-dive] dep blob (b64+gz):", depBlob.length, "bytes");
console.log("[build-dive] locale blob (b64+gz):", localeBlob.length, "bytes");
console.log(
  "[build-dive] univer readable section:",
  UNIVER_CORE.reduce((n, f) => n + readVendor(f).length, 0) +
    UNIVER_FACADES.reduce((n, f) => n + readVendor(f).length, 0),
  "bytes"
);

let template = readFileSync(TEMPLATE, "utf8");

function splice(marker, replacement) {
  // Replace the marker (including the adjacent literal `[]` or `""` fallback
  // the template compiles against) with the generated content.
  const patterns = [
    // const X: T[] = /* __MARKER__ */ [];
    new RegExp(`/\\* ${marker} \\*/\\s*\\[\\s*\\]`, "g"),
    // const X: string = /* __MARKER__ */ "";
    new RegExp(`/\\* ${marker} \\*/\\s*""`, "g"),
  ];
  for (const p of patterns) {
    if (p.test(template)) {
      // Pass a function so `$`-sequences in replacement aren't interpreted
      // as special patterns (a $' in minified UMD code expands to the ENTIRE
      // tail of the template, causing >10x size blowup).
      template = template.replace(p, () => `/* ${marker} */ ${replacement}`);
      return;
    }
  }
  throw new Error(`Marker not found: ${marker}`);
}

splice("__UNIVER_SCRIPTS__", univerCoreSection);
splice("__UNIVER_FACADES__", univerFacadeSection);
splice("__CSS_FILES__", cssSection);
splice("__DEP_BLOB__", jsQuote(depBlob));
splice("__LOCALE_BLOB__", jsQuote(localeBlob));

writeFileSync(OUT, template);
console.log("[build-dive] wrote", OUT, "size:", template.length, "bytes");
